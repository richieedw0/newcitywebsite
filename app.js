function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[character];
  });
}

function sanitizeDeep(value) {
  if (Array.isArray(value)) return value.map(sanitizeDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeDeep(item)]));
  }
  return typeof value === "string" ? escapeHtml(value) : value;
}

function safeCart() {
  try {
    const items = JSON.parse(localStorage.getItem("new-city-cart") || "[]");
    if (!Array.isArray(items)) return [];
    return items
      .filter((item) => item && typeof item.slug === "string")
      .map((item) => ({ slug: item.slug.replace(/[^a-z0-9-]/g, ""), quantity: Math.max(1, Math.min(Number(item.quantity) || 1, 20)) }));
  } catch {
    return [];
  }
}

const state = {
  site: null,
  trustItems: [],
  proofPoints: [],
  categories: [],
  products: [],
  cart: safeCart(),
  adminToken: sessionStorage.getItem("new-city-admin-session") || "",
  adminUsername: sessionStorage.getItem("new-city-admin-username") || "Richie",
  adminDashboard: null,
  adminPanel: sessionStorage.getItem("new-city-admin-panel") || "overview",
  adminProductQuery: "",
  catalogBannerHidden: sessionStorage.getItem("new-city-catalog-banner-hidden") === "true",
  query: "",
  category: "",
  inStockOnly: false,
};

const navItems = [
  { label: "Catalog", href: "/catalog" },
  { label: "Living Room", href: "/category/living-room" },
  { label: "Bedroom", href: "/category/bedroom" },
  { label: "Dining", href: "/category/dining" },
  { label: "Admin", href: "/admin" },
];

const formatter = new Intl.NumberFormat("en-JM", {
  style: "currency",
  currency: "JMD",
  maximumFractionDigits: 0,
});

async function getJson(path, options = {}) {
  const response = await fetch(path, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(escapeHtml(payload.error || `Unable to load ${path}`));
  return sanitizeDeep(payload);
}

async function loadData() {
  const [siteData, categoryData, productData] = await Promise.all([
    getJson("/api/site"),
    getJson("/api/categories"),
    getJson("/api/products"),
  ]);

  state.site = siteData.site;
  state.trustItems = siteData.trustItems;
  state.proofPoints = siteData.proofPoints;
  state.categories = categoryData.categories;
  state.products = productData.products;
}

function route() {
  const path = window.location.pathname;
  if (path.startsWith("/category/")) return { name: "category", slug: path.split("/").pop() };
  if (path.startsWith("/product/")) return { name: "product", slug: path.split("/").pop() };
  if (path === "/catalog") return { name: "catalog" };
  if (path === "/cart") return { name: "cart" };
  if (path === "/checkout") return { name: "checkout" };
  if (path === "/admin") return { name: "admin" };
  if (path === "/contact") return { name: "contact" };
  return { name: "home" };
}

function saveCart() {
  localStorage.setItem("new-city-cart", JSON.stringify(state.cart));
}

function cartCount() {
  return state.cart.reduce((sum, item) => sum + item.quantity, 0);
}

function cartRows() {
  return state.cart
    .map((item) => {
      const product = state.products.find((candidate) => candidate.slug === item.slug);
      if (!product) return null;
      return { ...product, quantity: item.quantity, lineTotal: product.price * item.quantity };
    })
    .filter(Boolean);
}

function cartTotal() {
  return cartRows().reduce((sum, item) => sum + item.lineTotal, 0);
}

function navigate(event) {
  const link = event.target.closest("a[data-link]");
  if (!link) return;
  event.preventDefault();
  closeMobileMenu();
  window.history.pushState({}, "", link.href);
  render();
  if (window.location.hash) {
    document.querySelector(window.location.hash)?.scrollIntoView({ behavior: "smooth" });
    return;
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function header() {
  return `
    <header class="site-header">
      <a class="brand" href="/" data-link aria-label="New City Furniture home">
        <img src="/assets/images/new-city-furniture-logo.png" alt="${state.site.brand}" />
      </a>
      <nav aria-label="Main navigation">
        ${navItems.map((item) => `<a href="${item.href}" data-link>${item.label}</a>`).join("")}
      </nav>
      <div class="header-tools">
        <a class="icon-link" href="/cart" data-link aria-label="Cart">Cart <strong>${cartCount()}</strong></a>
        <button class="menu-button" type="button" aria-expanded="false" aria-controls="mobile-menu">Menu</button>
      </div>
    </header>
    <div class="mobile-menu" id="mobile-menu" hidden>
      ${navItems.map((item) => `<a href="${item.href}" data-link>${item.label}</a>`).join("")}
      <a href="/cart" data-link>Cart (${cartCount()})</a>
      <a href="/contact" data-link>Contact</a>
    </div>
  `;
}

function footer() {
  return `
    <footer class="site-footer">
      <div>
        <strong>${state.site.brand}</strong>
        <p>${state.site.summary}</p>
      </div>
      <div>
        <p>Shop</p>
        ${state.categories.slice(0, 5).map((item) => `<a href="/category/${item.slug}" data-link>${item.title}</a>`).join("")}
      </div>
      <div>
        <p>Support</p>
        <a href="/contact" data-link>WhatsApp</a>
        <a href="/checkout" data-link>Checkout</a>
        <a href="/admin" data-link>Admin</a>
      </div>
    </footer>
  `;
}

function button(label, href, modifier = "primary", extra = "") {
  const isExternal = href.startsWith("http");
  const attrs = isExternal ? `target="_blank" rel="noopener"` : "data-link";
  return `<a class="button button--${escapeHtml(modifier)}" href="${escapeHtml(href)}" ${attrs} ${extra}>${escapeHtml(label)}</a>`;
}

function sectionIntro(eyebrow, title, text) {
  return `
    <div class="section-intro">
      <div>
        <p>${eyebrow}</p>
        <h2>${title}</h2>
      </div>
      <span>${text}</span>
    </div>
  `;
}

function categoryCard(item) {
  return `
    <a class="image-card" href="/category/${item.slug}" data-link>
      <img src="${item.image}" alt="${item.title}" loading="lazy" />
      <div class="image-card__body">
        <h3>${item.title}</h3>
        <p>${item.text}</p>
      </div>
    </a>
  `;
}

function productCard(product) {
  return `
    <article class="product-card">
      <a class="product-card__image" href="/product/${product.slug}" data-link>
        <img src="${product.image}" alt="${product.name}" loading="lazy" />
        <span>${product.badge}</span>
      </a>
      <div class="product-card__content">
        <p>${product.categoryLabel}</p>
        <h3>${product.name}</h3>
        <small>${product.material} · ${product.leadTime}</small>
        <div>
          <strong>${product.displayPrice}</strong>
          ${
            product.isPriced
              ? `<button class="small-action" type="button" data-add="${product.slug}">Add</button>`
              : `<a class="small-action" href="${state.site.whatsappUrl}" target="_blank" rel="noopener">Ask</a>`
          }
        </div>
      </div>
    </article>
  `;
}

function homePage() {
  const featured = state.products.slice(0, 4);
  return `
    <main>
      <section class="hero">
        <div class="hero__media" aria-hidden="true">
          <img src="https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1800&q=82" alt="" />
        </div>
        <div class="hero__content">
          <p>Premium Jamaican furniture showroom</p>
          <h1>${state.site.tagline}</h1>
          <span>${state.site.summary}</span>
          <div class="hero__actions">
            ${button("Shop Catalog", "/catalog")}
            ${button("Talk on WhatsApp", state.site.whatsappUrl, "secondary")}
          </div>
        </div>
      </section>

      <section class="trust-strip" aria-label="Store highlights">
        ${state.trustItems.map((item) => `<span>${item}</span>`).join("")}
      </section>

      <section class="section categories" id="shop">
        ${sectionIntro("Find your room", "A calmer way to furnish a beautiful Jamaican home.", "Browse by room, then refine by stock, finish, material, and budget as the catalog grows.")}
        <div class="category-grid">${state.categories.map(categoryCard).join("")}</div>
      </section>

      <section class="section featured">
        ${sectionIntro("Featured pieces", "Clear product cards with pricing, stock, and delivery context.", "The site now supports cart actions, product specs, and checkout readiness instead of only brochure pages.")}
        <div class="product-grid">${featured.map(productCard).join("")}</div>
      </section>

      <section class="proof-band">
        ${state.proofPoints.map((item) => `<article><h3>${item.title}</h3><p>${item.text}</p></article>`).join("")}
      </section>

      <section class="story">
        <div class="story__image">
          <img src="https://images.unsplash.com/photo-1594026112284-02bb6f3352fe?auto=format&fit=crop&w=1200&q=82" alt="Warm wood furniture detail" loading="lazy" />
        </div>
        <div class="story__content">
          <p>Showroom service, online convenience</p>
          <h2>Browse online, ask better questions, and buy with confidence.</h2>
          <span>New City can use this foundation for real inventory, local delivery rules, secure payment links, and a protected admin workflow for daily operations.</span>
          <a class="text-link" href="/catalog" data-link>Explore the catalog</a>
        </div>
      </section>

      ${contactCta()}
    </main>
  `;
}

function catalogControls(activeCategory = "") {
  state.category = activeCategory || state.category;
  return `
    <form class="catalog-tools" id="catalog-tools" role="search">
      <label>
        <span>Search</span>
        <input name="q" type="search" value="${escapeHtml(state.query)}" placeholder="Sofa, mattress, desk..." />
      </label>
      <label>
        <span>Category</span>
        <select name="category">
          <option value="">All rooms</option>
          ${state.categories.map((item) => `<option value="${item.slug}" ${state.category === item.slug ? "selected" : ""}>${item.title}</option>`).join("")}
        </select>
      </label>
      <label class="check">
        <input name="inStock" type="checkbox" ${state.inStockOnly ? "checked" : ""} />
        <span>In stock only</span>
      </label>
    </form>
  `;
}

function filteredProducts(activeCategory = "") {
  const query = state.query.trim().toLowerCase();
  const category = activeCategory || state.category;
  return state.products.filter((product) => {
    const text = [product.name, product.categoryLabel, product.description, product.material, product.finish, product.features.join(" ")]
      .join(" ")
      .toLowerCase();
    return (!query || text.includes(query)) && (!category || product.category === category) && (!state.inStockOnly || product.inStock);
  });
}

function catalogPage(activeCategory = "") {
  const category = activeCategory ? state.categories.find((item) => item.slug === activeCategory) : null;
  const products = filteredProducts(activeCategory);
  return `
    <main>
      <section class="section catalog-section">
        ${catalogIntro(category)}
        ${catalogControls(activeCategory)}
        <div class="result-bar"><strong>${products.length}</strong> products shown</div>
        <div class="product-grid product-grid--listing">
          ${products.length ? products.map(productCard).join("") : emptyState("No products match those filters yet.")}
        </div>
      </section>
      ${contactCta()}
    </main>
  `;
}

function catalogIntro(category) {
  if (state.catalogBannerHidden) return "";
  return `
    <div class="catalog-intro">
      <div>
        <p>${category ? "Shop category" : "Full catalog"}</p>
        <h1>${category ? category.title : "Furniture catalog"}</h1>
        <span>${category ? category.text : "Search, filter, and add products to cart without losing sight of the catalog."}</span>
      </div>
      <button class="catalog-intro__close" type="button" aria-label="Hide catalog intro" data-hide-catalog-intro>Hide</button>
    </div>
  `;
}

function productPage(slug) {
  const product = state.products.find((item) => item.slug === slug);
  if (!product) return notFoundPage("Product not found");

  return `
    <main>
      <section class="product-detail">
        <div class="product-detail__image">
          <img src="${product.image}" alt="${product.name}" />
        </div>
        <div class="product-detail__content">
          <p>${product.categoryLabel}</p>
          <h1>${product.name}</h1>
          <strong>${product.displayPrice}</strong>
          ${product.displayCompareAt ? `<em>Compared at ${product.displayCompareAt}</em>` : ""}
          <span>${product.description}</span>
          <dl class="spec-list">
            <div><dt>SKU</dt><dd>${product.sku}</dd></div>
            <div><dt>Stock</dt><dd>${product.inStock ? `${product.stock} available` : "Quote required"}</dd></div>
            <div><dt>Lead time</dt><dd>${product.leadTime}</dd></div>
            <div><dt>Dimensions</dt><dd>${product.dimensions}</dd></div>
          </dl>
          <ul class="feature-list">${product.features.map((feature) => `<li>${feature}</li>`).join("")}</ul>
          <div class="hero__actions">
            ${
              product.isPriced
                ? `<button class="button button--primary" type="button" data-add="${product.slug}">Add to Cart</button>`
                : button("Ask for Price", state.site.whatsappUrl)
            }
            ${button("Ask on WhatsApp", state.site.whatsappUrl, "secondary")}
          </div>
        </div>
      </section>
      ${contactCta()}
    </main>
  `;
}

function cartPage() {
  const rows = cartRows();
  return `
    <main>
      <section class="page-hero page-hero--compact">
        <p>Cart</p>
        <h1>Review your selections.</h1>
        <span>Adjust quantities before moving into checkout. Final stock, delivery, and payment provider details should be confirmed by New City.</span>
      </section>
      <section class="cart-layout">
        <div class="cart-list">
          ${
            rows.length
              ? rows
                  .map(
                    (item) => `
                      <article class="cart-row">
                        <img src="${item.image}" alt="${item.name}" />
                        <div>
                          <h2>${item.name}</h2>
                          <p>${item.displayPrice} · ${item.leadTime}</p>
                          <div class="qty">
                            <button type="button" data-qty="${item.slug}" data-change="-1">-</button>
                            <span>${item.quantity}</span>
                            <button type="button" data-qty="${item.slug}" data-change="1">+</button>
                          </div>
                        </div>
                        <strong>${formatter.format(item.lineTotal)}</strong>
                      </article>
                    `
                  )
                  .join("")
              : emptyState("Your cart is empty.")
          }
        </div>
        <aside class="summary-panel">
          <p>Estimated subtotal</p>
          <strong>${formatter.format(cartTotal())}</strong>
          <span>Delivery and installation fees depend on parish, access, and service level.</span>
          ${button("Continue to Checkout", rows.length ? "/checkout" : "/catalog")}
        </aside>
      </section>
    </main>
  `;
}

function checkoutPage(message = "") {
  const rows = cartRows();
  return `
    <main>
      <section class="page-hero page-hero--compact">
        <p>Checkout readiness</p>
        <h1>Prepare a local payment intent.</h1>
        <span>${state.site.paymentNote}</span>
      </section>
      <section class="checkout-layout">
        <form class="checkout-form" id="checkout-form">
          <label><span>Name</span><input name="name" required placeholder="Customer name" /></label>
          <label><span>Phone</span><input name="phone" required placeholder="WhatsApp or mobile" /></label>
          <label><span>Email</span><input name="email" type="email" placeholder="Email for receipt" /></label>
          <label><span>Delivery area</span><input name="area" placeholder="Parish, town, or showroom pickup" /></label>
          <label><span>Payment preference</span><select name="payment"><option>Payment link</option><option>Card checkout</option><option>Bank transfer</option><option>Showroom payment</option></select></label>
          <button class="button button--primary" type="submit" ${rows.length ? "" : "disabled"}>Create Checkout Preview</button>
        </form>
        <aside class="summary-panel">
          <p>${rows.length} items</p>
          <strong>${formatter.format(cartTotal())}</strong>
          <span>${escapeHtml(message || "Submitting creates a local checkout preview without charging the customer.")}</span>
        </aside>
      </section>
    </main>
  `;
}

function adminPage(message = "") {
  return `
    <main>
      <section class="page-hero page-hero--compact">
        <p>Admin</p>
        <h1>Operate catalog, inventory, orders, and content.</h1>
        <span>Sign in to view products, stock, orders, website content, delivery settings, and payment setup from the database.</span>
      </section>
      <section class="admin-shell">
        <form class="admin-login" id="admin-login">
          <label><span>Username</span><input name="username" autocomplete="username" value="${escapeHtml(state.adminUsername)}" /></label>
          <label><span>Password</span><input name="password" type="password" autocomplete="current-password" placeholder="Password" /></label>
          <button class="button button--primary" type="submit">Sign In</button>
          ${state.adminToken ? `<button class="button button--secondary" type="button" id="admin-resume">Open Saved Session</button>` : ""}
        </form>
        <div id="admin-dashboard">${message ? `<div class="empty-state">${message}</div>` : adminPlaceholder()}</div>
      </section>
    </main>
  `;
}

function adminPlaceholder() {
  return `
    <div class="admin-grid">
      <article><p>Products</p><strong>${state.products.length}</strong><span>Catalog records ready for editing UI.</span></article>
      <article><p>Cart preview</p><strong>${formatter.format(cartTotal())}</strong><span>Current visitor cart state.</span></article>
      <article><p>Database</p><strong>SQLite</strong><span>Products, orders, settings, payment, delivery, and admins are stored in one easy local file.</span></article>
    </div>
  `;
}

function adminDashboard(data) {
  const dashboard = data.dashboard || data;
  state.adminDashboard = dashboard;
  return `
    <div class="admin-grid">
      <article><p>Revenue pipeline</p><strong>${dashboard.counts.revenuePipelineDisplay}</strong><span>${dashboard.counts.orders} active orders</span></article>
      <article><p>Products</p><strong>${dashboard.counts.products}</strong><span>${dashboard.counts.lowStock} low or quote-required items</span></article>
      <article><p>Categories</p><strong>${dashboard.counts.categories}</strong><span>Navigation and catalog taxonomy</span></article>
    </div>
    ${adminTabs()}
    <div class="admin-panel">${adminPanel(dashboard)}</div>
  `;
}

function adminTabs() {
  const tabs = [
    ["overview", "Overview"],
    ["website", "Website"],
    ["products", "Products"],
    ["categories", "Categories"],
    ["orders", "Orders"],
    ["delivery", "Delivery"],
    ["payments", "Payments"],
    ["content", "Content"],
  ];
  return `
    <div class="admin-tabs" role="tablist" aria-label="Admin sections">
      ${tabs
        .map(
          ([key, label]) => `
            <button class="${state.adminPanel === key ? "is-active" : ""}" type="button" data-admin-panel="${key}">
              ${label}
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

function adminPanel(dashboard) {
  if (state.adminPanel === "website") return siteEditor(dashboard.site);
  if (state.adminPanel === "products") return productsEditor(dashboard);
  if (state.adminPanel === "categories") return categoriesEditor(dashboard);
  if (state.adminPanel === "orders") return ordersEditor(dashboard.orders);
  if (state.adminPanel === "delivery") return deliveryEditor(dashboard.deliveryZones);
  if (state.adminPanel === "payments") return paymentEditor(dashboard.paymentProviders);
  if (state.adminPanel === "content") return contentEditor(dashboard.contentBlocks);
  return adminOverview(dashboard);
}

function adminOverview(dashboard) {
  return `
    <section class="admin-editor-card admin-editor-card--wide">
      <h2>Today</h2>
      <div class="admin-quick-grid">
        <button type="button" data-admin-panel="products"><strong>Update products</strong><span>Add prices, stock, photos, and details.</span></button>
        <button type="button" data-admin-panel="orders"><strong>Check orders</strong><span>Move orders from quote to delivery.</span></button>
        <button type="button" data-admin-panel="website"><strong>Edit website info</strong><span>Change contact, hours, WhatsApp, and showroom text.</span></button>
        <button type="button" data-admin-panel="delivery"><strong>Delivery setup</strong><span>Manage parish/area delivery estimates.</span></button>
      </div>
      <div class="admin-row-list">
        <div class="admin-row"><span>Low stock</span><strong>${dashboard.lowStock.map((item) => item.name).join(", ") || "None"}</strong><em>Review stock before promising delivery dates.</em></div>
        <div class="admin-row"><span>Payment setup</span><strong>${dashboard.paymentProviders.map((item) => item.name).join(", ")}</strong><em>Choose one provider to connect first.</em></div>
      </div>
    </section>
  `;
}

function inputField(label, name, value = "", type = "text") {
  return `<label><span>${label}</span><input name="${name}" type="${type}" value="${escapeHtml(value)}" /></label>`;
}

function textareaField(label, name, value = "") {
  return `<label><span>${label}</span><textarea name="${name}">${escapeHtml(value)}</textarea></label>`;
}

function productReadiness(product = {}) {
  const needs = [];
  if (!Number(product.price)) needs.push("price");
  if (!Number(product.stock)) needs.push("stock");
  if (!product.image) needs.push("photo");
  if (!product.description) needs.push("description");
  return needs;
}

function readinessBadge(product = {}) {
  const needs = productReadiness(product);
  if (!product.name) return `<mark class="admin-status admin-status--new">New</mark>`;
  if (!needs.length) return `<mark class="admin-status admin-status--ready">Ready</mark>`;
  return `<mark class="admin-status admin-status--needs">Needs ${needs.slice(0, 2).join(" + ")}</mark>`;
}

function priceText(product = {}) {
  return Number(product.price) > 0 ? formatter.format(Number(product.price)) : "Request price";
}

function selectField(label, name, options, selected = "") {
  return `
    <label><span>${label}</span><select name="${name}">
      ${options.map(([value, text]) => `<option value="${escapeHtml(value)}" ${String(selected) === String(value) ? "selected" : ""}>${escapeHtml(text)}</option>`).join("")}
    </select></label>
  `;
}

function adminSection(title, formId, body, buttonText = "Save") {
  return `
    <section class="admin-editor-card">
      <h2>${title}</h2>
      <form id="${formId}" class="admin-edit-form">
        ${body}
        <button class="button button--primary" type="submit">${buttonText}</button>
      </form>
    </section>
  `;
}

function siteEditor(site) {
  return adminSection(
    "Website Details",
    "admin-site-form",
    `
      ${inputField("Business Name", "brand", site.brand)}
      ${inputField("Tagline", "tagline", site.tagline)}
      ${textareaField("Summary", "summary", site.summary)}
      ${inputField("Currency", "currency", site.currency)}
      ${inputField("Phone", "phone", site.phone)}
      ${inputField("Branch Phone", "branchPhone", site.branchPhone || "")}
      ${inputField("WhatsApp Link", "whatsappUrl", site.whatsappUrl)}
      ${inputField("Email", "email", site.email, "email")}
      ${inputField("Website", "website", site.website || "https://www.thenewcityfurnitureja.com", "url")}
      ${inputField("Address", "address", site.address || site.showroom || "")}
      ${inputField("Showroom", "showroom", site.showroom)}
      ${inputField("Branch Address", "branchAddress", site.branchAddress || "")}
      ${inputField("Hours", "hours", site.hours)}
      ${inputField("Founded", "founded", site.founded || "")}
      ${inputField("Facebook Link", "facebookUrl", site.facebookUrl || "", "url")}
      ${inputField("Instagram Link", "instagramUrl", site.instagramUrl || "", "url")}
      ${textareaField("Business Description", "businessDescription", site.businessDescription || "")}
      ${textareaField("Payment Plan Note", "paymentPlanNote", site.paymentPlanNote || "")}
      ${inputField("Delivery Note", "deliveryLabel", site.deliveryLabel || "")}
      ${textareaField("Payment Note", "paymentNote", site.paymentNote)}
      ${textareaField("Source Note", "sourceNote", site.sourceNote || "")}
    `
  );
}

function productForm(product = {}, index = "new") {
  const isNew = index === "new";
  const activeValue = product.active === 0 || product.active === false ? "false" : "true";
  return `
    <details class="admin-edit-disclosure" ${isNew ? "open" : ""}>
      <summary>
        <img class="admin-product-thumb" src="${product.image || "/assets/images/new-city-furniture-logo.png"}" alt="" loading="lazy" />
        <span>${product.sku || "New"}</span>
        <strong>${product.name ? product.name : "Add New Product"}</strong>
        <em>${priceText(product)} · ${Number(product.stock || 0)} stock</em>
        ${readinessBadge(product)}
      </summary>
      <form class="admin-edit-form admin-edit-form--compact" data-admin-endpoint="/api/admin/products">
        <div class="admin-product-editor">
          <aside class="admin-photo-panel">
            <img src="${product.image || "/assets/images/new-city-furniture-logo.png"}" alt="" loading="lazy" />
            <p>${product.name || "New product photo"}</p>
          </aside>
          <div class="admin-field-groups">
            <div class="admin-field-group">
              <h3>Basic Details</h3>
              ${inputField("Product Name", "name", product.name || "")}
              ${inputField("SKU", "sku", product.sku || "NC-NEW-001")}
              ${inputField("Slug", "slug", product.slug || "new-product")}
              <label><span>Category</span><select name="category">
                ${(state.categories || []).map((item) => `<option value="${item.slug}" ${product.category === item.slug ? "selected" : ""}>${item.title}</option>`).join("")}
              </select></label>
              ${inputField("Category Label", "categoryLabel", product.categoryLabel || "")}
              ${selectField("Visibility", "active", [["true", "Show on website"], ["false", "Hide from website"]], activeValue)}
            </div>
            <div class="admin-field-group">
              <h3>Price And Stock</h3>
              ${inputField("Price", "price", product.price || 0, "number")}
              ${inputField("Compare At", "compareAt", product.compareAt || 0, "number")}
              ${inputField("Stock", "stock", product.stock || 0, "number")}
              ${inputField("Lead Time", "leadTime", product.leadTime || "")}
              ${inputField("Badge", "badge", product.badge || "")}
            </div>
            <div class="admin-field-group">
              <h3>Photo And Specs</h3>
              <label><span>Upload Product Photo</span><input name="imageUpload" type="file" accept="image/png,image/jpeg,image/webp" /></label>
              ${inputField("Image Link", "image", product.image || "")}
              ${inputField("Material", "material", product.material || "")}
              ${inputField("Finish", "finish", product.finish || "")}
              ${inputField("Dimensions", "dimensions", product.dimensions || "")}
            </div>
            <div class="admin-field-group admin-field-group--wide">
              <h3>Customer Description</h3>
              ${textareaField("Description", "description", product.description || "")}
              ${textareaField("Features, separated by commas", "features", (product.features || []).join(", "))}
            </div>
            <button class="button button--primary" type="submit">${isNew ? "Add Product" : "Save Product"}</button>
          </div>
        </div>
      </form>
    </details>
  `;
}

function productsEditor(dashboard) {
  const products = dashboard.products || [];
  const query = state.adminProductQuery.trim().toLowerCase();
  const visibleProducts = query
    ? products.filter((product) =>
        [product.name, product.sku, product.categoryLabel, product.badge, product.displayPrice].join(" ").toLowerCase().includes(query)
      )
    : products;
  const needsPrice = products.filter((product) => !Number(product.price)).length;
  const needsPhoto = products.filter((product) => !product.image).length;
  const lowStock = products.filter((product) => Number(product.stock || 0) <= 3).length;
  return `
    <section class="admin-editor-card admin-editor-card--wide">
      <div class="admin-card-head">
        <div>
          <h2>Products</h2>
          <p>Open one product, update the fields, then save. Items without prices invite customers to ask instead of checking out.</p>
        </div>
        <div class="admin-mini-stats">
          <span>${products.length} products</span>
          <span>${needsPrice} need prices</span>
          <span>${needsPhoto} need photos</span>
          <span>${lowStock} low stock</span>
        </div>
      </div>
      <label class="admin-search"><span>Find Product</span><input id="admin-product-search" value="${escapeHtml(state.adminProductQuery)}" placeholder="Search by name, SKU, category, or status" /></label>
      <div class="admin-nested-list">
        ${visibleProducts.map((product, index) => productForm(product, index)).join("") || emptyState("No matching products.")}
        ${productForm()}
      </div>
    </section>
  `;
}

function categoryForm(category = {}, index = "new") {
  return `
    <details class="admin-edit-disclosure" ${index === "new" ? "open" : ""}>
      <summary><span>${category.slug || "New"}</span><strong>${category.title || "Add New Category"}</strong><em>${category.text || "Ready to add"}</em></summary>
      <form class="admin-edit-form admin-edit-form--compact" data-admin-endpoint="/api/admin/categories">
        ${inputField("Slug", "slug", category.slug || "new-category")}
        ${inputField("Title", "title", category.title || "")}
        ${textareaField("Description", "text", category.text || "")}
        ${inputField("Image Link", "image", category.image || "")}
        ${inputField("Display Order", "display_order", category.display_order || 0, "number")}
        <button class="button button--primary" type="submit">${index === "new" ? "Add Category" : "Save Category"}</button>
      </form>
    </details>
  `;
}

function categoriesEditor(dashboard) {
  return `
    <section class="admin-editor-card">
      <h2>Categories</h2>
      <div class="admin-nested-list">
        ${(dashboard.categories || state.categories).map((category, index) => categoryForm(category, index)).join("")}
        ${categoryForm()}
      </div>
    </section>
  `;
}

function ordersEditor(orders) {
  if (!orders.length) {
    return `<section class="admin-editor-card"><h2>Orders</h2>${emptyState("No orders yet. New checkout requests will appear here.")}</section>`;
  }
  const statusOptions = [
    ["New checkout request", "New checkout request"],
    ["Awaiting payment link", "Awaiting payment link"],
    ["Payment sent", "Payment sent"],
    ["Paid", "Paid"],
    ["Preparing order", "Preparing order"],
    ["Delivery scheduled", "Delivery scheduled"],
    ["Completed", "Completed"],
    ["Cancelled", "Cancelled"],
  ];
  return `
    <section class="admin-editor-card">
      <div class="admin-card-head">
        <div>
          <h2>Orders</h2>
          <p>Use the status menu to keep each customer request moving.</p>
        </div>
      </div>
      <div class="admin-row-list">
        ${orders
          .map(
            (order) => `
              <form class="admin-inline-form" data-admin-endpoint="/api/admin/orders/status">
                <input type="hidden" name="id" value="${order.id}" />
                <div>
                  <span>${order.id} · ${order.created || "Today"}</span>
                  <strong>${order.customer} · ${formatter.format(order.total)}</strong>
                  <em>${order.items.join(", ")} · ${order.phone || "No phone"} · ${order.delivery_area || "No delivery area"}</em>
                </div>
                <select name="status">
                  ${statusOptions.map(([value, text]) => `<option value="${value}" ${order.status === value ? "selected" : ""}>${text}</option>`).join("")}
                </select>
                <button class="small-action" type="submit">Update</button>
              </form>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function deliveryEditor(zones) {
  const form = (zone = {}, index = "new") => `
    <form class="admin-edit-form admin-edit-form--compact" data-admin-endpoint="/api/admin/delivery-zones">
      <h3>${zone.name || "Add Delivery Zone"}</h3>
      ${inputField("Key", "key", zone.key || "new-zone")}
      ${inputField("Name", "name", zone.name || "")}
      ${inputField("Estimate", "estimate", zone.estimate || 0, "number")}
      ${textareaField("Notes", "notes", zone.notes || "")}
      <button class="button button--primary" type="submit">${index === "new" ? "Add Zone" : "Save Zone"}</button>
    </form>
  `;
  return `<section class="admin-editor-card"><h2>Delivery Zones</h2><div class="admin-nested-list">${zones.map(form).join("")}${form()}</div></section>`;
}

function paymentEditor(providers) {
  const form = (provider = {}, index = "new") => `
    <form class="admin-edit-form admin-edit-form--compact" data-admin-endpoint="/api/admin/payment-providers">
      <h3>${provider.name || "Add Payment Provider"}</h3>
      ${inputField("Key", "key", provider.key || "new-provider")}
      ${inputField("Name", "name", provider.name || "")}
      ${inputField("Status", "status", provider.status || "")}
      ${textareaField("Notes", "notes", provider.notes || "")}
      <button class="button button--primary" type="submit">${index === "new" ? "Add Provider" : "Save Provider"}</button>
    </form>
  `;
  return `<section class="admin-editor-card"><h2>Payment Providers</h2><div class="admin-nested-list">${providers.map(form).join("")}${form()}</div></section>`;
}

function contentEditor(blocks) {
  const form = (block = {}, index = "new") => `
    <form class="admin-edit-form admin-edit-form--compact" data-admin-endpoint="/api/admin/content">
      <h3>${block.key || "Add Content Block"}</h3>
      ${inputField("Key", "key", block.key || "newBlock")}
      ${inputField("Status", "status", block.status || "")}
      ${inputField("Owner", "owner", block.owner || "")}
      ${inputField("Updated", "updated", block.updated || new Date().toISOString().slice(0, 10), "date")}
      <button class="button button--primary" type="submit">${index === "new" ? "Add Block" : "Save Block"}</button>
    </form>
  `;
  return `<section class="admin-editor-card"><h2>Content Blocks</h2><div class="admin-nested-list">${blocks.map(form).join("")}${form()}</div></section>`;
}

function contactPage() {
  return `
    <main>
      <section class="page-hero page-hero--compact">
        <p>Showroom and delivery</p>
        <h1>Talk with New City before you buy.</h1>
        <span>Use this page for WhatsApp, showroom visit planning, delivery questions, and quote requests.</span>
      </section>
      <section class="contact-grid">
        <article><h2>Contact</h2><p>${state.site.phone}${state.site.branchPhone ? `<br />Savanna-la-Mar: ${state.site.branchPhone}` : ""}<br />${state.site.email}</p>${button("WhatsApp Us", state.site.whatsappUrl)}</article>
        <article><h2>Showrooms</h2><p>${state.site.address || state.site.showroom}${state.site.branchAddress ? `<br />${state.site.branchAddress}` : ""}<br />${state.site.hours}</p>${button("Visit Website", state.site.website || "/contact", "secondary")}</article>
        <article><h2>About</h2><p>${state.site.businessDescription || state.site.summary}<br />${state.site.paymentPlanNote || state.site.deliveryLabel}</p>${button("Checkout", "/checkout", "secondary")}</article>
      </section>
    </main>
  `;
}

function contactCta() {
  return `
    <section class="cta" id="contact">
      <div>
        <p>Showroom, delivery, and product help</p>
        <h2>See it in person, add it to cart, or arrange delivery.</h2>
      </div>
      <div class="cta__actions">
        ${button("Open Catalog", "/catalog")}
        ${button("Visit Cart", "/cart", "secondary")}
      </div>
    </section>
  `;
}

function emptyState(text) {
  return `<div class="empty-state">${escapeHtml(text)}</div>`;
}

function notFoundPage(message) {
  return `
    <main>
      <section class="page-hero">
        <p>Page unavailable</p>
        <h1>${message}</h1>
        <span>The page may be added later as the inventory structure grows.</span>
        ${button("Return Home", "/")}
      </section>
    </main>
  `;
}

function bindMenu() {
  const button = document.querySelector(".menu-button");
  const menu = document.querySelector("#mobile-menu");
  if (!button || !menu) return;
  button.addEventListener("click", () => {
    const isOpen = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", String(!isOpen));
    menu.hidden = isOpen;
  });
}

function closeMobileMenu() {
  const button = document.querySelector(".menu-button");
  const menu = document.querySelector("#mobile-menu");
  if (!button || !menu) return;
  button.setAttribute("aria-expanded", "false");
  menu.hidden = true;
}

function bindCatalog() {
  const form = document.querySelector("#catalog-tools");
  const hideButton = document.querySelector("[data-hide-catalog-intro]");
  hideButton?.addEventListener("click", () => {
    state.catalogBannerHidden = true;
    sessionStorage.setItem("new-city-catalog-banner-hidden", "true");
    render();
  });
  if (!form) return;
  form.addEventListener("input", () => {
    const values = new FormData(form);
    state.query = values.get("q") || "";
    state.category = values.get("category") || "";
    state.inStockOnly = values.get("inStock") === "on";
    state.catalogBannerHidden = true;
    sessionStorage.setItem("new-city-catalog-banner-hidden", "true");
    render();
  });
}

function bindCartActions() {
  document.querySelectorAll("[data-add]").forEach((button) => {
    button.addEventListener("click", () => {
      const slug = button.dataset.add;
      const existing = state.cart.find((item) => item.slug === slug);
      if (existing) existing.quantity += 1;
      else state.cart.push({ slug, quantity: 1 });
      saveCart();
      render();
    });
  });

  document.querySelectorAll("[data-qty]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = state.cart.find((candidate) => candidate.slug === button.dataset.qty);
      if (!item) return;
      item.quantity += Number(button.dataset.change);
      state.cart = state.cart.filter((candidate) => candidate.quantity > 0);
      saveCart();
      render();
    });
  });
}

function bindCheckout() {
  const form = document.querySelector("#checkout-form");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = new FormData(form);
    const payload = {
      items: state.cart,
      customer: {
        name: values.get("name"),
        phone: values.get("phone"),
        email: values.get("email"),
      },
      delivery: { area: values.get("area") },
      paymentPreference: values.get("payment"),
    };
    try {
      const result = await getJson("/api/checkout/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      state.cart = [];
      saveCart();
      render(checkoutPage(`Order ${result.order.id} saved. Total: ${result.checkout.totalDisplay}. New City can now follow up from admin.`));
    } catch (error) {
      render(checkoutPage(error.message));
    }
  });
}

function bindAdmin() {
  const form = document.querySelector("#admin-login");
  if (!form) return;
  document.querySelector("#admin-resume")?.addEventListener("click", async () => {
    const panel = document.querySelector("#admin-dashboard");
    panel.innerHTML = emptyState("Loading dashboard...");
    try {
      const data = await getJson("/api/admin/dashboard", { headers: { Authorization: `Bearer ${state.adminToken}` } });
      panel.innerHTML = adminDashboard(data);
      bindAdminEditors();
    } catch (error) {
      panel.innerHTML = emptyState("Please sign in again.");
    }
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = new FormData(form);
    const username = values.get("username").trim();
    const password = values.get("password");
    state.adminUsername = username;
    sessionStorage.setItem("new-city-admin-username", username);
    const panel = document.querySelector("#admin-dashboard");
    panel.innerHTML = emptyState("Signing in...");
    try {
      const login = await getJson("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      state.adminToken = login.session.token;
      sessionStorage.setItem("new-city-admin-session", state.adminToken);
      const data = await getJson("/api/admin/dashboard", { headers: { Authorization: `Bearer ${state.adminToken}` } });
      panel.innerHTML = adminDashboard(data);
      bindAdminEditors();
    } catch (error) {
      panel.innerHTML = emptyState(error.message);
    }
  });
}

function formToObject(form) {
  const values = new FormData(form);
  return Object.fromEntries(
    Array.from(values.entries())
      .filter(([, value]) => !(value instanceof File))
      .map(([key, value]) => [key, String(value).trim()])
  );
}

async function adminPost(path, payload) {
  if (!state.adminToken) throw new Error("Please sign in again.");
  return getJson(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${state.adminToken}`,
    },
    body: JSON.stringify(payload),
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Image could not be read."));
    reader.readAsDataURL(file);
  });
}

async function uploadAdminImage(file) {
  if (!file || !file.name) return "";
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error("Use a JPG, PNG, or WEBP image.");
  }
  if (file.size > 4_000_000) {
    throw new Error("Image must be under 4 MB.");
  }
  const dataUrl = await fileToDataUrl(file);
  const result = await adminPost("/api/admin/uploads", { filename: file.name, dataUrl });
  return result.upload.url;
}

async function refreshAdminDashboard(message = "Saved.") {
  const panel = document.querySelector("#admin-dashboard");
  const data = await getJson("/api/admin/dashboard", { headers: { Authorization: `Bearer ${state.adminToken}` } });
  await loadData();
  panel.innerHTML = `${emptyState(message)}${adminDashboard(data)}`;
  bindAdminEditors();
}

function bindAdminTabs() {
  document.querySelectorAll("[data-admin-panel]").forEach((button) => {
    button.addEventListener("click", () => {
      state.adminPanel = button.dataset.adminPanel;
      sessionStorage.setItem("new-city-admin-panel", state.adminPanel);
      if (state.adminDashboard) {
        document.querySelector("#admin-dashboard").innerHTML = adminDashboard({ dashboard: state.adminDashboard });
        bindAdminEditors();
      }
    });
  });
}

function bindAdminEditors() {
  bindAdminTabs();
  const productSearch = document.querySelector("#admin-product-search");
  productSearch?.addEventListener("input", () => {
    state.adminProductQuery = productSearch.value;
    if (state.adminDashboard) {
      document.querySelector("#admin-dashboard").innerHTML = adminDashboard({ dashboard: state.adminDashboard });
      bindAdminEditors();
      document.querySelector("#admin-product-search")?.focus();
    }
  });
  document.querySelectorAll('input[name="imageUpload"]').forEach((input) => {
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      const preview = input.closest(".admin-product-editor")?.querySelector(".admin-photo-panel img");
      if (preview) preview.src = URL.createObjectURL(file);
    });
  });
  const siteForm = document.querySelector("#admin-site-form");
  if (siteForm) {
    siteForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await adminPost("/api/admin/site", formToObject(siteForm));
        await refreshAdminDashboard("Website details saved.");
      } catch (error) {
        document.querySelector("#admin-dashboard").insertAdjacentHTML("afterbegin", emptyState(error.message));
      }
    });
  }

  document.querySelectorAll("[data-admin-endpoint]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const payload = formToObject(form);
      try {
        const imageFile = form.querySelector('input[name="imageUpload"]')?.files?.[0];
        if (imageFile) payload.image = await uploadAdminImage(imageFile);
        if (payload.features) payload.features = payload.features.split(",").map((item) => item.trim()).filter(Boolean);
        if ("price" in payload) payload.price = Number(payload.price);
        if ("compareAt" in payload) payload.compareAt = Number(payload.compareAt);
        if ("stock" in payload) payload.stock = Number(payload.stock);
        if ("estimate" in payload) payload.estimate = Number(payload.estimate);
        if ("display_order" in payload) payload.display_order = Number(payload.display_order);
        await adminPost(form.dataset.adminEndpoint, payload);
        await refreshAdminDashboard("Saved to the database.");
      } catch (error) {
        document.querySelector("#admin-dashboard").insertAdjacentHTML("afterbegin", emptyState(error.message));
      }
    });
  });
}

function render(forcedPage = "") {
  const current = route();
  let page = forcedPage || homePage();
  if (!forcedPage && current.name === "catalog") page = catalogPage();
  if (!forcedPage && current.name === "category") page = catalogPage(current.slug);
  if (!forcedPage && current.name === "product") page = productPage(current.slug);
  if (!forcedPage && current.name === "cart") page = cartPage();
  if (!forcedPage && current.name === "checkout") page = checkoutPage();
  if (!forcedPage && current.name === "admin") page = adminPage();
  if (!forcedPage && current.name === "contact") page = contactPage();

  document.querySelector("#app").innerHTML = `${header()}${page}${footer()}`;
  bindMenu();
  bindCatalog();
  bindCartActions();
  bindCheckout();
  bindAdmin();
  bindAdminEditors();
}

document.addEventListener("click", navigate);
window.addEventListener("popstate", () => render());

loadData()
  .then(() => render())
  .catch(() => {
    document.querySelector("#app").innerHTML = `
      <main class="load-error">
        <h1>New City Furniture</h1>
        <p>The site data could not load. Please restart the local server.</p>
      </main>
    `;
  });
