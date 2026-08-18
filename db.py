from datetime import datetime, timedelta, timezone
from hashlib import pbkdf2_hmac
from hmac import compare_digest
from json import dumps, loads
from os import environ, urandom
from pathlib import Path
from secrets import token_urlsafe
import sqlite3

try:
    from .data import CATEGORIES, CONTENT_BLOCKS, ORDERS, PRODUCTS, PROOF_POINTS, SITE, TRUST_ITEMS
except ImportError:
    from data import CATEGORIES, CONTENT_BLOCKS, ORDERS, PRODUCTS, PROOF_POINTS, SITE, TRUST_ITEMS


ROOT = Path(__file__).resolve().parents[1]
DB_PATH = Path(environ.get("NEW_CITY_DB", ROOT / "new_city.sqlite3"))
PASSWORD_ITERATIONS = 240_000
SESSION_HOURS = 8


def connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def hash_password(password, salt=None):
    salt = salt or urandom(16)
    digest = pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS)
    return salt.hex(), digest.hex()


def verify_password(password, salt_hex, digest_hex):
    salt = bytes.fromhex(salt_hex)
    _, supplied = hash_password(password, salt)
    return compare_digest(supplied, digest_hex)


def row_to_dict(row):
    return dict(row) if row else None


def decode_json_fields(item, field_names):
    for field in field_names:
        value = item.get(field)
        item[field] = loads(value) if value else []
    return item


def init_db():
    with connect() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS site_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS categories (
                slug TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                text TEXT NOT NULL,
                image TEXT NOT NULL,
                display_order INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS products (
                slug TEXT PRIMARY KEY,
                sku TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                categoryLabel TEXT NOT NULL,
                price INTEGER NOT NULL,
                compareAt INTEGER NOT NULL DEFAULT 0,
                badge TEXT NOT NULL DEFAULT '',
                stock INTEGER NOT NULL DEFAULT 0,
                leadTime TEXT NOT NULL DEFAULT '',
                material TEXT NOT NULL DEFAULT '',
                finish TEXT NOT NULL DEFAULT '',
                dimensions TEXT NOT NULL DEFAULT '',
                description TEXT NOT NULL DEFAULT '',
                features TEXT NOT NULL DEFAULT '[]',
                image TEXT NOT NULL DEFAULT '',
                active INTEGER NOT NULL DEFAULT 1,
                FOREIGN KEY (category) REFERENCES categories(slug)
            );

            CREATE TABLE IF NOT EXISTS orders (
                id TEXT PRIMARY KEY,
                customer TEXT NOT NULL,
                status TEXT NOT NULL,
                total INTEGER NOT NULL,
                method TEXT NOT NULL,
                created TEXT NOT NULL,
                items TEXT NOT NULL DEFAULT '[]'
            );

            CREATE TABLE IF NOT EXISTS content_blocks (
                key TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                owner TEXT NOT NULL,
                updated TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS trust_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                text TEXT NOT NULL,
                display_order INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS proof_points (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                text TEXT NOT NULL,
                display_order INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS payment_providers (
                key TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                status TEXT NOT NULL,
                notes TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS delivery_zones (
                key TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                estimate INTEGER NOT NULL,
                notes TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS admins (
                username TEXT PRIMARY KEY,
                password_salt TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS admin_sessions (
                token TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (username) REFERENCES admins(username)
            );
            """
        )
        add_missing_columns(db)
        seed_if_empty(db)
        assert_production_ready(db)


def add_missing_columns(db):
    order_columns = {row["name"] for row in db.execute("PRAGMA table_info(orders)")}
    extra_order_columns = {
        "phone": "TEXT NOT NULL DEFAULT ''",
        "email": "TEXT NOT NULL DEFAULT ''",
        "delivery_area": "TEXT NOT NULL DEFAULT ''",
        "delivery_estimate": "INTEGER NOT NULL DEFAULT 0",
        "subtotal": "INTEGER NOT NULL DEFAULT 0",
        "payment_preference": "TEXT NOT NULL DEFAULT ''",
    }
    for column, definition in extra_order_columns.items():
        if column not in order_columns:
            db.execute(f"ALTER TABLE orders ADD COLUMN {column} {definition}")


def seed_if_empty(db):
    if db.execute("SELECT COUNT(*) FROM site_settings").fetchone()[0] == 0:
        db.executemany(
            "INSERT INTO site_settings (key, value) VALUES (?, ?)",
            [(key, dumps(value) if isinstance(value, (list, dict)) else str(value)) for key, value in SITE.items()],
        )

    if db.execute("SELECT COUNT(*) FROM categories").fetchone()[0] == 0:
        db.executemany(
            "INSERT INTO categories (slug, title, text, image, display_order) VALUES (?, ?, ?, ?, ?)",
            [(item["slug"], item["title"], item["text"], item["image"], index) for index, item in enumerate(CATEGORIES)],
        )

    if db.execute("SELECT COUNT(*) FROM products").fetchone()[0] == 0:
        db.executemany(
            """
            INSERT INTO products (
                slug, sku, name, category, categoryLabel, price, compareAt, badge, stock,
                leadTime, material, finish, dimensions, description, features, image, active
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            """,
            [
                (
                    item["slug"],
                    item["sku"],
                    item["name"],
                    item["category"],
                    item["categoryLabel"],
                    item["price"],
                    item.get("compareAt", 0),
                    item["badge"],
                    item["stock"],
                    item["leadTime"],
                    item["material"],
                    item["finish"],
                    item["dimensions"],
                    item["description"],
                    dumps(item["features"]),
                    item["image"],
                )
                for item in PRODUCTS
            ],
        )

    if db.execute("SELECT COUNT(*) FROM orders").fetchone()[0] == 0:
        db.executemany(
            "INSERT INTO orders (id, customer, status, total, method, created, items) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [
                (item["id"], item["customer"], item["status"], item["total"], item["method"], item["created"], dumps(item["items"]))
                for item in ORDERS
            ],
        )

    if db.execute("SELECT COUNT(*) FROM content_blocks").fetchone()[0] == 0:
        db.executemany(
            "INSERT INTO content_blocks (key, status, owner, updated) VALUES (?, ?, ?, ?)",
            [(item["key"], item["status"], item["owner"], item["updated"]) for item in CONTENT_BLOCKS],
        )

    if db.execute("SELECT COUNT(*) FROM trust_items").fetchone()[0] == 0:
        db.executemany(
            "INSERT INTO trust_items (text, display_order) VALUES (?, ?)",
            [(text, index) for index, text in enumerate(TRUST_ITEMS)],
        )

    if db.execute("SELECT COUNT(*) FROM proof_points").fetchone()[0] == 0:
        db.executemany(
            "INSERT INTO proof_points (title, text, display_order) VALUES (?, ?, ?)",
            [(item["title"], item["text"], index) for index, item in enumerate(PROOF_POINTS)],
        )

    if db.execute("SELECT COUNT(*) FROM payment_providers").fetchone()[0] == 0:
        db.executemany(
            "INSERT INTO payment_providers (key, name, status, notes) VALUES (?, ?, ?, ?)",
            [
                ("wipay", "WiPay", "Ready to connect", "Add merchant credentials and webhook handling."),
                ("fygaro", "Fygaro", "Ready to connect", "Useful for payment links and hosted checkout."),
                ("ncb", "NCB e-commerce", "Requires merchant setup", "Confirm bank requirements before build-out."),
                ("lynk", "Lynk", "Research needed", "Confirm business account and online checkout options."),
            ],
        )

    if db.execute("SELECT COUNT(*) FROM delivery_zones").fetchone()[0] == 0:
        db.executemany(
            "INSERT INTO delivery_zones (key, name, estimate, notes) VALUES (?, ?, ?, ?)",
            [
                ("pickup", "Showroom pickup", 0, "Customer collects from showroom."),
                ("kingston", "Kingston and St. Andrew", 6500, "Base local delivery estimate."),
                ("st-catherine", "St. Catherine", 8500, "Confirm exact area before final invoice."),
                ("islandwide", "Islandwide", 15000, "Quote final cost by parish and access."),
            ],
        )

    if db.execute("SELECT COUNT(*) FROM admins WHERE username = ?", ("Richie",)).fetchone()[0] == 0:
        salt, digest = hash_password(environ.get("NEW_CITY_RICHIE_PASSWORD", "Richie"))
        db.execute(
            "INSERT INTO admins (username, password_salt, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
            ("Richie", salt, digest, "owner", now()),
        )


def assert_production_ready(connection):
    if environ.get("NEW_CITY_ENV", "").lower() != "production":
        return
    row = connection.execute("SELECT * FROM admins WHERE username = ?", ("Richie",)).fetchone()
    if row and verify_password("Richie", row["password_salt"], row["password_hash"]):
        raise RuntimeError("Change Richie's default password before running in production.")
    allowed_origins = environ.get("NEW_CITY_ALLOWED_ORIGINS", "")
    if not allowed_origins or "127.0.0.1" in allowed_origins or "localhost" in allowed_origins:
        raise RuntimeError("Set NEW_CITY_ALLOWED_ORIGINS to the real HTTPS website domain before production.")


def now():
    return datetime.now(timezone.utc).isoformat()


def site_settings():
    with connect() as db:
        return {row["key"]: row["value"] for row in db.execute("SELECT key, value FROM site_settings")}


def categories():
    with connect() as db:
        return [row_to_dict(row) for row in db.execute("SELECT * FROM categories ORDER BY display_order, title")]


def products(active_only=True):
    query = "SELECT * FROM products"
    if active_only:
        query += " WHERE active = 1"
    query += " ORDER BY name"
    with connect() as db:
        return [decode_json_fields(row_to_dict(row), ["features"]) for row in db.execute(query)]


def product_by_slug(slug):
    with connect() as db:
        row = db.execute("SELECT * FROM products WHERE slug = ? AND active = 1", (slug,)).fetchone()
        return decode_json_fields(row_to_dict(row), ["features"]) if row else None


def orders():
    with connect() as db:
        return [decode_json_fields(row_to_dict(row), ["items"]) for row in db.execute("SELECT * FROM orders ORDER BY created DESC")]


def next_order_id(connection):
    year = datetime.now().year
    prefix = f"NC-{year}-"
    rows = connection.execute("SELECT id FROM orders WHERE id LIKE ? ORDER BY id DESC", (f"{prefix}%",)).fetchall()
    if not rows:
        return f"{prefix}0001"
    last = rows[0]["id"].rsplit("-", 1)[-1]
    try:
        number = int(last) + 1
    except ValueError:
        number = 1
    return f"{prefix}{number:04d}"


def create_order(checkout, payload):
    customer = payload.get("customer", {})
    delivery = payload.get("delivery", {})
    items = [f"{item['quantity']} x {item['name']}" for item in checkout["items"]]
    with connect() as db:
        order_id = next_order_id(db)
        db.execute(
            """
            INSERT INTO orders (
                id, customer, status, total, method, created, items, phone, email,
                delivery_area, delivery_estimate, subtotal, payment_preference
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                order_id,
                clean_text(customer.get("name"), 160) or "Website customer",
                "New checkout request",
                checkout["total"],
                clean_text(payload.get("paymentPreference"), 120) or "Payment link",
                datetime.now().date().isoformat(),
                dumps(items),
                clean_text(customer.get("phone"), 60),
                clean_text(customer.get("email"), 180),
                clean_text(delivery.get("area"), 180),
                checkout["deliveryEstimate"],
                checkout["subtotal"],
                clean_text(payload.get("paymentPreference"), 120) or "Payment link",
            ),
        )
    return next((order for order in orders() if order["id"] == order_id), None)


def content_blocks():
    with connect() as db:
        return [row_to_dict(row) for row in db.execute("SELECT * FROM content_blocks ORDER BY key")]


def trust_items():
    with connect() as db:
        return [row["text"] for row in db.execute("SELECT text FROM trust_items ORDER BY display_order, id")]


def proof_points():
    with connect() as db:
        return [row_to_dict(row) for row in db.execute("SELECT title, text FROM proof_points ORDER BY display_order, id")]


def payment_providers():
    with connect() as db:
        return [row_to_dict(row) for row in db.execute("SELECT * FROM payment_providers ORDER BY name")]


def delivery_zones():
    with connect() as db:
        return [row_to_dict(row) for row in db.execute("SELECT * FROM delivery_zones ORDER BY estimate, name")]


def delivery_estimate(area):
    area_text = (area or "").lower()
    zones = delivery_zones()
    for zone in zones:
        if zone["key"] != "islandwide" and zone["key"] in area_text:
            return zone["estimate"]
    if "pickup" in area_text or "showroom" in area_text:
        return 0
    islandwide = next((zone for zone in zones if zone["key"] == "islandwide"), None)
    return islandwide["estimate"] if islandwide else 6500


def create_session(username, password):
    with connect() as db:
        row = db.execute("SELECT * FROM admins WHERE username = ?", (username,)).fetchone()
        if row is None or not verify_password(password, row["password_salt"], row["password_hash"]):
            return None
        token = token_urlsafe(32)
        expires_at = (datetime.now(timezone.utc) + timedelta(hours=SESSION_HOURS)).isoformat()
        db.execute(
            "INSERT INTO admin_sessions (token, username, expires_at, created_at) VALUES (?, ?, ?, ?)",
            (token, username, expires_at, now()),
        )
        return {"token": token, "username": username, "role": row["role"], "expiresAt": expires_at}


def session_user(token):
    if not token:
        return None
    with connect() as db:
        row = db.execute(
            """
            SELECT admin_sessions.username, admins.role, admin_sessions.expires_at
            FROM admin_sessions
            JOIN admins ON admins.username = admin_sessions.username
            WHERE token = ?
            """,
            (token,),
        ).fetchone()
        if row is None:
            return None
        expires_at = datetime.fromisoformat(row["expires_at"])
        if expires_at <= datetime.now(timezone.utc):
            db.execute("DELETE FROM admin_sessions WHERE token = ?", (token,))
            return None
        return {"username": row["username"], "role": row["role"], "expiresAt": row["expires_at"]}


def update_site_settings(values):
    allowed = {
        "brand",
        "currency",
        "phone",
        "branchPhone",
        "whatsappUrl",
        "email",
        "website",
        "address",
        "showroom",
        "branchAddress",
        "hours",
        "founded",
        "facebookUrl",
        "instagramUrl",
        "deliveryLabel",
        "businessDescription",
        "paymentPlanNote",
        "paymentNote",
        "sourceNote",
        "summary",
        "tagline",
    }
    updates = [(key, str(value)[:1000]) for key, value in values.items() if key in allowed]
    with connect() as db:
        db.executemany("INSERT OR REPLACE INTO site_settings (key, value) VALUES (?, ?)", updates)
    return site_settings()


def change_admin_password(username, new_password):
    if len(new_password) < 12:
        raise ValueError("Use at least 12 characters for the new password.")
    salt, digest = hash_password(new_password)
    with connect() as db:
        updated = db.execute(
            "UPDATE admins SET password_salt = ?, password_hash = ? WHERE username = ?",
            (salt, digest, username),
        ).rowcount
        db.execute("DELETE FROM admin_sessions WHERE username = ?", (username,))
    if not updated:
        raise ValueError("Admin user was not found.")
    return True


def clean_text(value, limit=500):
    return str(value or "").strip()[:limit]


def clean_int(value, default=0, minimum=0, maximum=99_999_999):
    try:
        number = int(value)
    except (TypeError, ValueError):
        number = default
    return max(minimum, min(number, maximum))


def upsert_category(values):
    item = {
        "slug": clean_text(values.get("slug"), 120).lower().replace(" ", "-"),
        "title": clean_text(values.get("title"), 160),
        "text": clean_text(values.get("text"), 700),
        "image": clean_text(values.get("image"), 1200),
        "display_order": clean_int(values.get("display_order")),
    }
    if not item["slug"] or not item["title"]:
        raise ValueError("Category slug and title are required.")
    with connect() as db:
        db.execute(
            """
            INSERT INTO categories (slug, title, text, image, display_order)
            VALUES (:slug, :title, :text, :image, :display_order)
            ON CONFLICT(slug) DO UPDATE SET
                title = excluded.title,
                text = excluded.text,
                image = excluded.image,
                display_order = excluded.display_order
            """,
            item,
        )
    return item


def upsert_product(values):
    features = values.get("features", [])
    if isinstance(features, str):
        features = [feature.strip() for feature in features.split(",") if feature.strip()]
    if not isinstance(features, list):
        features = []
    active_value = values.get("active", True)
    if isinstance(active_value, str):
        active_value = active_value.strip().lower() not in {"0", "false", "no", "off", "inactive"}
    item = {
        "slug": clean_text(values.get("slug"), 120).lower().replace(" ", "-"),
        "sku": clean_text(values.get("sku"), 80),
        "name": clean_text(values.get("name"), 180),
        "category": clean_text(values.get("category"), 120),
        "categoryLabel": clean_text(values.get("categoryLabel"), 120),
        "price": clean_int(values.get("price")),
        "compareAt": clean_int(values.get("compareAt")),
        "badge": clean_text(values.get("badge"), 80),
        "stock": clean_int(values.get("stock")),
        "leadTime": clean_text(values.get("leadTime"), 140),
        "material": clean_text(values.get("material"), 160),
        "finish": clean_text(values.get("finish"), 160),
        "dimensions": clean_text(values.get("dimensions"), 160),
        "description": clean_text(values.get("description"), 1200),
        "features": dumps([clean_text(feature, 180) for feature in features[:8]]),
        "image": clean_text(values.get("image"), 1200),
        "active": 1 if active_value else 0,
    }
    if not item["slug"] or not item["sku"] or not item["name"] or not item["category"]:
        raise ValueError("Product slug, SKU, name, and category are required.")
    with connect() as db:
        db.execute(
            """
            INSERT INTO products (
                slug, sku, name, category, categoryLabel, price, compareAt, badge, stock,
                leadTime, material, finish, dimensions, description, features, image, active
            )
            VALUES (
                :slug, :sku, :name, :category, :categoryLabel, :price, :compareAt, :badge, :stock,
                :leadTime, :material, :finish, :dimensions, :description, :features, :image, :active
            )
            ON CONFLICT(slug) DO UPDATE SET
                sku = excluded.sku,
                name = excluded.name,
                category = excluded.category,
                categoryLabel = excluded.categoryLabel,
                price = excluded.price,
                compareAt = excluded.compareAt,
                badge = excluded.badge,
                stock = excluded.stock,
                leadTime = excluded.leadTime,
                material = excluded.material,
                finish = excluded.finish,
                dimensions = excluded.dimensions,
                description = excluded.description,
                features = excluded.features,
                image = excluded.image,
                active = excluded.active
            """,
            item,
        )
    return product_by_slug(item["slug"]) or item


def update_order_status(order_id, status):
    with connect() as db:
        db.execute("UPDATE orders SET status = ? WHERE id = ?", (clean_text(status, 120), clean_text(order_id, 80)))
    return orders()


def upsert_payment_provider(values):
    item = {
        "key": clean_text(values.get("key"), 80).lower().replace(" ", "-"),
        "name": clean_text(values.get("name"), 160),
        "status": clean_text(values.get("status"), 160),
        "notes": clean_text(values.get("notes"), 700),
    }
    if not item["key"] or not item["name"]:
        raise ValueError("Payment provider key and name are required.")
    with connect() as db:
        db.execute(
            """
            INSERT INTO payment_providers (key, name, status, notes)
            VALUES (:key, :name, :status, :notes)
            ON CONFLICT(key) DO UPDATE SET
                name = excluded.name,
                status = excluded.status,
                notes = excluded.notes
            """,
            item,
        )
    return payment_providers()


def upsert_delivery_zone(values):
    item = {
        "key": clean_text(values.get("key"), 80).lower().replace(" ", "-"),
        "name": clean_text(values.get("name"), 160),
        "estimate": clean_int(values.get("estimate")),
        "notes": clean_text(values.get("notes"), 700),
    }
    if not item["key"] or not item["name"]:
        raise ValueError("Delivery zone key and name are required.")
    with connect() as db:
        db.execute(
            """
            INSERT INTO delivery_zones (key, name, estimate, notes)
            VALUES (:key, :name, :estimate, :notes)
            ON CONFLICT(key) DO UPDATE SET
                name = excluded.name,
                estimate = excluded.estimate,
                notes = excluded.notes
            """,
            item,
        )
    return delivery_zones()


def upsert_content_block(values):
    item = {
        "key": clean_text(values.get("key"), 120),
        "status": clean_text(values.get("status"), 160),
        "owner": clean_text(values.get("owner"), 160),
        "updated": clean_text(values.get("updated"), 40) or datetime.now().date().isoformat(),
    }
    if not item["key"] or not item["status"]:
        raise ValueError("Content key and status are required.")
    with connect() as db:
        db.execute(
            """
            INSERT INTO content_blocks (key, status, owner, updated)
            VALUES (:key, :status, :owner, :updated)
            ON CONFLICT(key) DO UPDATE SET
                status = excluded.status,
                owner = excluded.owner,
                updated = excluded.updated
            """,
            item,
        )
    return content_blocks()
