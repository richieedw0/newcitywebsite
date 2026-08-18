from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from base64 import b64decode
from json import JSONDecodeError, dumps, loads
from os import environ
from pathlib import Path
from re import sub
from urllib.parse import parse_qs, urlparse

try:
    from . import db
except ImportError:
    import db


ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
UPLOADS = FRONTEND / "assets" / "uploads"
MAX_POST_BYTES = 6_500_000
ALLOWED_UPLOAD_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
ALLOWED_CORS_ORIGINS = {
    origin.strip()
    for origin in environ.get("NEW_CITY_ALLOWED_ORIGINS", "http://127.0.0.1:4173,http://127.0.0.1:4174").split(",")
    if origin.strip()
}


def is_secure_request(handler):
    headers = getattr(handler, "headers", None)
    return bool(headers and headers.get("X-Forwarded-Proto", "").lower() == "https")


def is_admin_path(path):
    return path == "/api/admin" or path.startswith("/api/admin/")


def set_cors_headers(handler):
    origin = handler.headers.get("Origin", "")
    if origin in ALLOWED_CORS_ORIGINS:
        handler.send_header("Access-Control-Allow-Origin", origin)
        handler.send_header("Vary", "Origin")


def json_response(handler, payload, status=200):
    body = dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    set_cors_headers(handler)
    handler.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
    if is_admin_path(urlparse(handler.path).path):
        handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def bearer_token(handler):
    header = handler.headers.get("Authorization", "")
    prefix = "Bearer "
    return header[len(prefix) :].strip() if header.startswith(prefix) else ""


def current_admin(handler):
    return db.session_user(bearer_token(handler))


def require_admin(handler):
    user = current_admin(handler)
    if user:
        return user
    json_response(
        handler,
        {
            "error": "Admin login required",
            "message": "Log in with your admin username and password.",
        },
        status=401,
    )
    return None


def money(amount):
    return f"J${amount:,.0f}"


def public_product(product):
    item = dict(product)
    item["displayPrice"] = money(product["price"]) if product["price"] > 0 else "Request price"
    item["displayCompareAt"] = money(product["compareAt"]) if product.get("compareAt") else ""
    item["isPriced"] = product["price"] > 0
    item["inStock"] = product.get("stock", 0) > 0
    return item


def visible_products():
    return [public_product(product) for product in db.products()]


def filter_products(params):
    products = visible_products()
    query = params.get("q", [""])[0].strip().lower()
    category = params.get("category", [""])[0].strip()
    in_stock = params.get("inStock", [""])[0] == "true"

    if query:
        products = [
            product
            for product in products
            if query in " ".join(
                [
                    product["name"],
                    product["categoryLabel"],
                    product["description"],
                    product["material"],
                    " ".join(product["features"]),
                ]
            ).lower()
        ]
    if category:
        products = [product for product in products if product["category"] == category]
    if in_stock:
        products = [product for product in products if product["inStock"]]
    return products


def dashboard_payload():
    products = [public_product(product) for product in db.products(active_only=False)]
    orders = db.orders()
    low_stock = [product for product in products if product.get("stock", 0) <= 3]
    revenue = sum(order["total"] for order in orders)
    return {
        "site": db.site_settings(),
        "categories": db.categories(),
        "products": products,
        "counts": {
            "categories": len(db.categories()),
            "products": len(products),
            "orders": len(orders),
            "lowStock": len(low_stock),
            "revenuePipeline": revenue,
            "revenuePipelineDisplay": money(revenue),
        },
        "lowStock": low_stock,
        "orders": orders,
        "contentBlocks": db.content_blocks(),
        "paymentProviders": db.payment_providers(),
        "deliveryZones": db.delivery_zones(),
        "routes": [
            "/api/admin/dashboard",
            "/api/admin/inventory",
            "/api/admin/orders",
            "/api/admin/content",
            "/api/admin/payment-providers",
            "/api/admin/delivery-zones",
            "/api/admin/site",
            "/api/admin/uploads",
        ],
    }


def read_json_body(handler):
    content_type = handler.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
    if content_type != "application/json":
        return None, "Content-Type must be application/json"
    try:
        length = int(handler.headers.get("Content-Length", "0"))
    except ValueError:
        return None, "Invalid content length"
    if length <= 0:
        return {}, None
    if length > MAX_POST_BYTES:
        return None, "Request body is too large"
    try:
        payload = loads(handler.rfile.read(length).decode("utf-8"))
        if not isinstance(payload, dict):
            return None, "Request body must be a JSON object"
        return payload, None
    except (UnicodeDecodeError, JSONDecodeError):
        return None, "Request body must be valid JSON"


def checkout_intent(payload):
    items = payload.get("items", [])
    customer = payload.get("customer", {})
    delivery = payload.get("delivery", {})
    if not isinstance(customer, dict) or not isinstance(delivery, dict):
        return None, "Customer and delivery fields must be objects."
    if not isinstance(items, list) or not items:
        return None, "Add at least one item before checkout."

    product_map = {product["slug"]: product for product in db.products()}
    normalized_items = []
    total = 0
    for item in items:
        if not isinstance(item, dict):
            return None, "Cart items must be objects."
        slug = item.get("slug")
        product = product_map.get(slug)
        if product is None:
            return None, f"Product is no longer available: {slug}"
        if product["price"] <= 0:
            return None, f"{product['name']} needs a showroom price before checkout."
        try:
            quantity = max(1, min(int(item.get("quantity", 1)), 20))
        except (TypeError, ValueError):
            return None, "Cart item quantity must be a number."
        line_total = product["price"] * quantity
        total += line_total
        normalized_items.append(
            {
                "sku": product["sku"],
                "slug": product["slug"],
                "name": product["name"],
                "quantity": quantity,
                "unitPrice": product["price"],
                "lineTotal": line_total,
                "lineTotalDisplay": money(line_total),
            }
        )

    delivery_estimate = db.delivery_estimate(delivery.get("area", ""))
    grand_total = total + delivery_estimate
    return {
        "intentId": "local-checkout-preview",
        "status": "payment_provider_not_connected",
        "currency": db.site_settings().get("currency", "JMD"),
        "items": normalized_items,
        "subtotal": total,
        "subtotalDisplay": money(total),
        "deliveryEstimate": delivery_estimate,
        "deliveryEstimateDisplay": money(delivery_estimate),
        "total": grand_total,
        "totalDisplay": money(grand_total),
        "customer": {
            "name": str(customer.get("name", ""))[:120].strip(),
            "phone": str(customer.get("phone", ""))[:40].strip(),
            "email": str(customer.get("email", ""))[:160].strip(),
        },
        "nextSteps": [
            "Connect merchant provider credentials.",
            "Create a hosted payment link or provider checkout session.",
            "Confirm delivery area, stock reservation, and order status webhooks.",
        ],
        "paymentProvidersReadyFor": [provider["name"] for provider in db.payment_providers()],
    }, None


def save_uploaded_image(payload):
    filename = str(payload.get("filename", "product-photo")).strip()
    data_url = str(payload.get("dataUrl", ""))
    if ";base64," not in data_url or not data_url.startswith("data:"):
        return None, "Upload must be an image file."
    media_type = data_url[5:].split(";", 1)[0]
    extension = ALLOWED_UPLOAD_TYPES.get(media_type)
    if extension is None:
        return None, "Use a JPG, PNG, or WEBP image."
    try:
        raw = b64decode(data_url.split(",", 1)[1], validate=True)
    except ValueError:
        return None, "Image upload could not be read."
    if not raw or len(raw) > 4_000_000:
        return None, "Image must be under 4 MB."

    UPLOADS.mkdir(parents=True, exist_ok=True)
    clean_name = sub(r"[^a-zA-Z0-9_-]+", "-", Path(filename).stem).strip("-").lower() or "product-photo"
    timestamp = sub(r"[^0-9A-Za-z]+", "", db.now())
    target = UPLOADS / f"{clean_name}-{timestamp}{extension}"
    target.write_bytes(raw)
    return {"url": f"/assets/uploads/{target.name}", "filename": target.name}, None


class NewCityHandler(SimpleHTTPRequestHandler):
    server_version = "NewCityFurniture"
    sys_version = ""

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()")
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        csp = (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self'; "
            "img-src 'self' https://images.unsplash.com data:; "
            "connect-src 'self'; "
            "font-src 'self'; "
            "form-action 'self'; "
            "frame-ancestors 'none'; "
            "base-uri 'self'"
        )
        if environ.get("NEW_CITY_ENV", "").lower() == "production" or is_secure_request(self):
            csp += "; upgrade-insecure-requests"
        self.send_header("Content-Security-Policy", csp)
        if is_secure_request(self):
            self.send_header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        set_cors_headers(self)
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
        self.end_headers()

    def translate_path(self, path):
        parsed = urlparse(path)
        clean_path = parsed.path.lstrip("/")
        if ".." in Path(clean_path).parts:
            return str(FRONTEND / "index.html")
        if clean_path.startswith("assets/"):
            return str(FRONTEND / clean_path)
        if "." in Path(clean_path).name:
            return str(FRONTEND / clean_path)
        return str(FRONTEND / "index.html")

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if is_admin_path(path):
            if path == "/api/admin/health":
                json_response(self, {"ok": True, "database": "ready"})
                return
            user = require_admin(self)
            if not user:
                return
            if path == "/api/admin/dashboard":
                json_response(self, {"ok": True, "user": user, "dashboard": dashboard_payload()})
                return
            if path == "/api/admin/settings" or path == "/api/admin/site":
                json_response(self, {"site": db.site_settings()})
                return
            if path == "/api/admin/inventory":
                json_response(self, {"categories": db.categories(), "products": [public_product(product) for product in db.products(active_only=False)]})
                return
            if path == "/api/admin/orders":
                json_response(self, {"orders": db.orders()})
                return
            if path == "/api/admin/content":
                json_response(self, {"contentBlocks": db.content_blocks(), "site": db.site_settings()})
                return
            if path == "/api/admin/payment-providers":
                json_response(self, {"paymentProviders": db.payment_providers()})
                return
            if path == "/api/admin/delivery-zones":
                json_response(self, {"deliveryZones": db.delivery_zones()})
                return
            json_response(self, {"error": "Admin endpoint not found"}, status=404)
            return

        if path == "/api/site":
            json_response(self, {"site": db.site_settings(), "trustItems": db.trust_items(), "proofPoints": db.proof_points()})
            return
        if path == "/api/categories":
            json_response(self, {"categories": db.categories()})
            return
        if path.startswith("/api/categories/"):
            slug = path.rsplit("/", 1)[-1]
            category = next((item for item in db.categories() if item["slug"] == slug), None)
            if category is None:
                json_response(self, {"error": "Category not found"}, status=404)
                return
            products = [product for product in visible_products() if product["category"] == slug]
            json_response(self, {"category": category, "products": products})
            return
        if path == "/api/products":
            json_response(self, {"products": filter_products(parse_qs(parsed.query))})
            return
        if path.startswith("/api/products/"):
            slug = path.rsplit("/", 1)[-1]
            product = db.product_by_slug(slug)
            if product is None:
                json_response(self, {"error": "Product not found"}, status=404)
                return
            json_response(self, {"product": public_product(product)})
            return

        return super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        payload, error = read_json_body(self)
        if error:
            json_response(self, {"error": error}, status=400)
            return

        if path == "/api/admin/login":
            session = db.create_session(str(payload.get("username", "")), str(payload.get("password", "")))
            if session is None:
                json_response(self, {"error": "Incorrect username or password"}, status=401)
                return
            json_response(self, {"ok": True, "session": session}, status=201)
            return

        if path == "/api/checkout/intent":
            intent, intent_error = checkout_intent(payload)
            if intent_error:
                json_response(self, {"error": intent_error}, status=400)
                return
            order = db.create_order(intent, payload)
            json_response(self, {"checkout": intent, "order": order}, status=201)
            return

        if is_admin_path(path):
            if not require_admin(self):
                return
            if path == "/api/admin/site":
                json_response(self, {"ok": True, "site": db.update_site_settings(payload)}, status=202)
                return
            try:
                if path == "/api/admin/uploads":
                    upload, upload_error = save_uploaded_image(payload)
                    if upload_error:
                        json_response(self, {"error": upload_error}, status=400)
                        return
                    json_response(self, {"ok": True, "upload": upload}, status=201)
                    return
                if path == "/api/admin/categories":
                    json_response(self, {"ok": True, "category": db.upsert_category(payload), "categories": db.categories()}, status=202)
                    return
                if path == "/api/admin/products":
                    product = db.upsert_product(payload)
                    json_response(self, {"ok": True, "product": public_product(product), "products": visible_products()}, status=202)
                    return
                if path == "/api/admin/orders/status":
                    json_response(
                        self,
                        {"ok": True, "orders": db.update_order_status(payload.get("id", ""), payload.get("status", ""))},
                        status=202,
                    )
                    return
                if path == "/api/admin/payment-providers":
                    json_response(
                        self,
                        {"ok": True, "paymentProviders": db.upsert_payment_provider(payload)},
                        status=202,
                    )
                    return
                if path == "/api/admin/delivery-zones":
                    json_response(self, {"ok": True, "deliveryZones": db.upsert_delivery_zone(payload)}, status=202)
                    return
                if path == "/api/admin/content":
                    json_response(self, {"ok": True, "contentBlocks": db.upsert_content_block(payload)}, status=202)
                    return
            except ValueError as exc:
                json_response(self, {"error": str(exc)}, status=400)
                return
            json_response(
                self,
                {
                    "ok": True,
                    "message": "Database endpoint is ready. Add the matching admin form for this section next.",
                    "received": payload,
                },
                status=202,
            )
            return

        json_response(self, {"error": "Endpoint not found"}, status=404)


def run(host="127.0.0.1", port=4173):
    db.init_db()
    server = ThreadingHTTPServer((host, port), NewCityHandler)
    print(f"New City Furniture site running at http://{host}:{port}")
    print(f"Database: {db.DB_PATH}")
    server.serve_forever()


if __name__ == "__main__":
    run()
