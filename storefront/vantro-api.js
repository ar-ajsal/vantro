document.addEventListener("DOMContentLoaded", async () => {
    const apiBase = window.__CHROMVAULT_API_BASE__ || "/v1";

    // Clean up broken external srcset immediately
    document.querySelectorAll('img[srcset*="vantro.com"], source[srcset*="vantro.com"]').forEach(el => {
        el.removeAttribute('srcset');
    });

    // --- HELPERS ---
    function getTitle(product) {
        if (!product) return "Product";
        if (product.title && typeof product.title === "object") return product.title.en || Object.values(product.title)[0] || "Product";
        return product.title || product.name || "Product";
    }
    function getPrice(product) {
        return product.prices?.price || product.price || 0;
    }
    function getImage(product) {
        if (!product) return "";
        const img = Array.isArray(product.image) ? product.image[0] : product.image;
        return img || "";
    }
    function getQty() {
        const qtyInput = document.querySelector(".qty-number-input, [name=quantity], input[type=number]");
        return parseInt(qtyInput?.value || "1", 10) || 1;
    }
    function readCart() { return JSON.parse(localStorage.getItem("cart") || "[]"); }
    function writeCart(cart) { localStorage.setItem("cart", JSON.stringify(cart)); }
    function addToCart(product, qty) {
        const cart = readCart();
        const id = product._id || product.id;
        const existing = cart.find(i => i.id === id);
        if (existing) { existing.quantity += qty; } else {
            cart.push({ id, title: getTitle(product), price: getPrice(product), image: getImage(product), quantity: qty });
        }
        writeCart(cart);
    }

    // --- HERO MEDIA HYDRATION ---
    const heroContainer = document.querySelector(".hero-bottom");
    if (heroContainer) {
        try {
            const res = await fetch(`${apiBase}/settings/hero_media`);
            if (res.ok) {
                const d = await res.json();
                const u = d.value || d.setting?.value;
                if (u) {
                    const isV = /\.(mp4|webm|mov)$/i.test(u) || u.includes("/video/upload/");
                    heroContainer.querySelectorAll(".hero-bottom-media").forEach(el => el.remove());
                    if (isV) {
                        const v = document.createElement("video");
                        v.className = "hero-bottom-media hero-bottom-video";
                        v.src = u;
                        v.autoplay = true;
                        v.loop = true;
                        v.muted = true;
                        v.playsInline = true;
                        v.setAttribute("playsinline", "");
                        v.setAttribute("webkit-playsinline", "");
                        v.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:1;";
                        heroContainer.prepend(v);
                        v.play().catch(() => {});
                    } else {
                        const img = document.createElement("img");
                        img.className = "hero-bottom-media hero-bottom-image";
                        img.src = u;
                        img.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:1;";
                        heroContainer.prepend(img);
                    }
                }
            }
        } catch(e){ console.error("[vantro] Hero media error:", e); }
    }

    // --- CATEGORIES HYDRATION ---
    try {
        const res = await fetch(`${apiBase}/category/all`);
        if (res.ok) {
            const data = await res.json();
            const cats = data.categories || data.data || [];
            const activeCats = cats.filter(c => c.status === "show" || !c.status);
            if (activeCats.length) {
                // Update mobile drawer links
                document.querySelectorAll(".mobile-menu-drawer__collections-list, [class*=collections-list]").forEach(c => {
                    c.innerHTML = "";
                    activeCats.forEach(cat => {
                        const name = typeof cat.name === "object" ? (cat.name.en || Object.values(cat.name)[0] || "Category") : (cat.name || "Category");
                        const slug = cat.slug || name.toLowerCase().replace(/\s+/g,"-");
                        const a = document.createElement("a");
                        a.href = `/collections/${slug}.html`;
                        a.className = "mobile-menu-drawer__collection-link";
                        a.innerText = name.toUpperCase();
                        c.appendChild(a);
                    });
                });

                // Update category grid on homepage
                const catGrid = document.querySelector(".category-grid");
                if (catGrid) {
                    catGrid.innerHTML = activeCats.map(cat => {
                        const name = typeof cat.name === "object" ? (cat.name.en || Object.values(cat.name)[0] || "Category") : (cat.name || "Category");
                        const icon = cat.icon || cat.image || "";
                        const slug = cat.slug || name.toLowerCase().replace(/\s+/g,"-");
                        return `
                            <a href="/collections/${slug}" class="category-item above-fold" style="opacity:1;transform:none;">
                                <div class="category-image-wrapper">
                                    <img src="${icon}" alt="${name}" loading="eager" style="display:block;max-width:65%;max-height:65%;object-fit:contain;" onerror="this.style.display='none'">
                                </div>
                                <h3 class="category-title">${name.toUpperCase()}</h3>
                            </a>
                        `;
                    }).join("");
                }
            }
        }
    } catch(e){ console.error("[vantro] Category hydration error:", e); }

    // --- PRODUCT PAGE HYDRATION ---
    if (window.location.pathname.startsWith("/products/")) {
        let slug = window.location.pathname.split("/").filter(Boolean).pop();
        if (slug.endsWith(".html")) slug = slug.replace(".html", "");
        try {
            const res = await fetch(`${apiBase}/products/slug/${slug}`);
            if (!res.ok) throw new Error(`API ${res.status}`);
            const raw = await res.json();
            const product = raw.data || raw.product || raw;
            window.__vantro_product__ = { id: product._id || product.id, title: getTitle(product), price: getPrice(product), image: getImage(product) };

            const currentCart = readCart();
            let cartUpdated = false;
            currentCart.forEach(item => {
                if (item.id === slug && (product._id || product.id)) {
                    item.id = product._id || product.id;
                    item.title = getTitle(product);
                    item.price = getPrice(product);
                    if (getImage(product)) item.image = getImage(product);
                    cartUpdated = true;
                }
            });
            if (cartUpdated) writeCart(currentCart);

            const title = getTitle(product);
            const price = getPrice(product);
            const imgUrl = getImage(product);

            // Title
            for (const sel of ["h1.product-title-text-render", "h1.product__title", ".product__title h1", "h1"]) {
                const els = document.querySelectorAll(sel);
                if (els.length) { els.forEach(el => { el.innerText = title; }); break; }
            }

            // Price
            const priceEls = document.querySelectorAll(".price-current, .price-item--regular, .price-item--sale");
            if (priceEls.length) { priceEls.forEach(el => { el.innerText = `Rs. ${price}`; }); }
            else { document.querySelectorAll("[class*=price]").forEach(el => { if (el.children.length === 0 && (el.innerText.includes("Rs") || el.innerText.includes("₹"))) el.innerText = `Rs. ${price}`; }); }

            // Description
            const descEl = document.querySelector(".product-description-text, .product__description");
            if (descEl && product.description) {
                const descText = typeof product.description === "object" ? (product.description.en || "") : product.description;
                if (descText) {
                    descEl.innerHTML = descText.split("\n").filter(Boolean).map(line => `<p>${line}</p>`).join("");
                }
            }

            // Images
            if (imgUrl) {
                document.querySelectorAll(".slider-slide img, .product-media-column img, img").forEach(img => {
                    const s = img.src || "";
                    if (!img.classList.contains("header__logo") && !img.classList.contains("mobile-menu-drawer__logo")) {
                        img.src = imgUrl;
                        img.srcset = "";
                    }
                });
            }

            // Stock
            const stockEl = document.querySelector(".product-stock-status-text");
            if (stockEl && typeof product.stock === "number") stockEl.innerText = product.stock > 0 ? `${product.stock} in stock` : "Out of stock";

            // Add to Cart / Buy Now
            const productForms = document.querySelectorAll('form[id*="productForm" i], form[id*="ProductPage" i], form.shopify-product-form, form[action*="/cart/add"], form[data-type="add-to-cart-form"], .product-form');
            productForms.forEach(form => {
                form.addEventListener("submit", e => {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    addToCart(product, getQty());
                    window.location.href = "/cart";
                }, true);
            });

            document.querySelectorAll(".btn-add-cart-outline, [name=add], .add-to-cart-btn").forEach(addBtn => {
                addBtn.addEventListener("click", e => {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    addToCart(product, getQty());
                    window.location.href = "/cart";
                }, true);
            });

            document.querySelectorAll(".btn-buy-now-solid, .shopify-payment-button__button").forEach(buyBtn => {
                buyBtn.addEventListener("click", e => {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    addToCart(product, getQty());
                    window.location.href = "/checkout";
                }, true);
            });

        } catch (err) { console.error("[vantro] Product hydration error:", err); }
    }

    // --- PRODUCT GRIDS HYDRATION ---
    const isHomePage = window.location.pathname === "/" || window.location.pathname === "/shop" || window.location.pathname === "/shop/" || window.location.pathname === "/index.html" || window.location.pathname === "";
    const pathMatch = window.location.pathname.match(/^\/(?:collections|product-category)\/([^/]+)/);

    // 1. Homepage Products:
    if (isHomePage) {
        try {
            const res = await fetch(`${apiBase}/products?limit=50`);
            if (res.ok) {
                const data = await res.json();
                const products = data.products || data.data || [];
                const activeProds = products.filter(p => p.status === "show" || !p.status);
                if (activeProds.length > 0) {
                    const gridEl = document.querySelector(".product-grid-container-template--22086712361118__product_listing_grid") || document.querySelector(".product-grid");
                    if (gridEl) {
                        gridEl.innerHTML = activeProds.map(p => {
                            const title = getTitle(p);
                            const price = getPrice(p);
                            const img = getImage(p);
                            const slug = p.slug || p._id || p.id;
                            const href = `/products/${slug}`;
                            return `
                                <div class="product-grid-item-template--22086712361118__product_listing_grid" style="border-right:1px solid #e5e5e5;border-bottom:1px solid #e5e5e5;padding:12px;background:#fff;">
                                    <a href="${href}" class="product-image-link-template--22086712361118__product_listing_grid" style="display:block;overflow:hidden;">
                                        <div class="product-image-container-template--22086712361118__product_listing_grid ratio-portrait" style="position:relative;width:100%;aspect-ratio:3/4;overflow:hidden;background:#f4f4f5;border-radius:2px;">
                                            <img src="${img}" alt="${title}" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;transition:transform .4s ease;">
                                        </div>
                                    </a>
                                    <div class="product-info-template--22086712361118__product_listing_grid" style="padding-top:12px;">
                                        <div class="product-info-top-template--22086712361118__product_listing_grid" style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;">
                                            <div class="product-title-wrap-template--22086712361118__product_listing_grid" style="flex:1;min-width:0;">
                                                <a href="${href}" class="product-title-template--22086712361118__product_listing_grid" style="font-size:13px;font-weight:600;text-decoration:none;color:#000;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${title}</a>
                                            </div>
                                            <div class="product-price-template--22086712361118__product_listing_grid" style="font-size:13px;font-weight:700;color:#000;white-space:nowrap;">Rs. ${price}</div>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join("");
                    }
                }
            }
        } catch(e) { console.error("[vantro] Homepage products error:", e); }
    }

    // 2. Collection Pages:
    if (!isHomePage && pathMatch) {
        const currentCategorySlug = pathMatch[1].replace(".html", "").toLowerCase();
        try {
            let url = `${apiBase}/products?limit=100`;
            if (currentCategorySlug !== "all") {
                const catRes = await fetch(`${apiBase}/category/all`);
                if (catRes.ok) {
                    const catData = await catRes.json();
                    const cats = catData.categories || catData.data || [];
                    const matchedCat = cats.find(c => {
                        const slug = (c.slug || (typeof c.name === "object" ? c.name.en : c.name) || "").toLowerCase().replace(/\s+/g,"-");
                        return slug === currentCategorySlug;
                    });
                    if (matchedCat) {
                        url = `${apiBase}/products?limit=100&category=${matchedCat._id}`;
                    }
                }
            }
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                const products = data.products || data.data || [];
                const activeProds = products.filter(p => p.status === "show" || !p.status);
                const gridEl = document.querySelector(".product-grid") || document.querySelector(".product-grid-container-template--22086712361118__product_listing_grid");
                if (gridEl && activeProds.length > 0) {
                    gridEl.innerHTML = activeProds.map(p => {
                        const title = getTitle(p);
                        const price = getPrice(p);
                        const img = getImage(p);
                        const slug = p.slug || p._id || p.id;
                        const href = `/products/${slug}`;
                        return `
                            <div class="product-grid-item-template--22086712361118__product_listing_grid" style="border-right:1px solid #e5e5e5;border-bottom:1px solid #e5e5e5;padding:12px;background:#fff;">
                                <a href="${href}" class="product-image-link-template--22086712361118__product_listing_grid" style="display:block;overflow:hidden;">
                                    <div class="product-image-container-template--22086712361118__product_listing_grid ratio-portrait" style="position:relative;width:100%;aspect-ratio:3/4;overflow:hidden;background:#f4f4f5;border-radius:2px;">
                                        <img src="${img}" alt="${title}" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;transition:transform .4s ease;">
                                    </div>
                                </a>
                                <div class="product-info-template--22086712361118__product_listing_grid" style="padding-top:12px;">
                                    <div class="product-info-top-template--22086712361118__product_listing_grid" style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;">
                                        <div class="product-title-wrap-template--22086712361118__product_listing_grid" style="flex:1;min-width:0;">
                                            <a href="${href}" class="product-title-template--22086712361118__product_listing_grid" style="font-size:13px;font-weight:600;text-decoration:none;color:#000;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${title}</a>
                                        </div>
                                        <div class="product-price-template--22086712361118__product_listing_grid" style="font-size:13px;font-weight:700;color:#000;white-space:nowrap;">Rs. ${price}</div>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join("");
                }
            }
        } catch(e) { console.error("[vantro] Collection hydration error:", e); }
    }

    // --- CART PAGE ---
    if (window.location.pathname === "/cart" || window.location.pathname.startsWith("/cart")) {
        const cart = readCart();
        let mainArea = document.getElementById("vantro-cart-root") || document.querySelector(".cart-items, tbody, .cart__items");
        if (!mainArea) {
            const mainEl = document.querySelector("main, #MainContent, .main-content");
            if (mainEl) {
                const div = document.createElement("div");
                div.id = "vantro-cart";
                div.style.cssText = "max-width:800px;margin:40px auto;padding:0 24px;";
                mainEl.appendChild(div);
                mainArea = div;
            }
        }
        if (mainArea) {
            if (cart.length === 0) {
                mainArea.innerHTML = `<div style="text-align:center;padding:80px 0;color:#71717a;"><p style="font-size:18px;margin-bottom:24px;">Your bag is empty.</p><a href="/" style="background:#000;color:#fff;padding:14px 28px;text-decoration:none;text-transform:uppercase;font-size:12px;font-weight:700;letter-spacing:.1em;border-radius:4px;">Continue Shopping</a></div>`;
            } else {
                let total = 0, html = `<table style="width:100%;border-collapse:collapse;"><thead><tr style="border-bottom:1px solid #e4e4e7;font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#71717a;"><th style="padding:16px 0;text-align:left;">Product</th><th style="padding:16px 8px;text-align:center;">Qty</th><th style="padding:16px 0;text-align:right;">Total</th><th></th></tr></thead><tbody>`;
                cart.forEach((item, idx) => {
                    total += item.price * item.quantity;
                    html += `<tr data-cart-idx="${idx}" style="border-bottom:1px solid #f4f4f5;"><td style="padding:16px 0;"><div style="display:flex;gap:16px;align-items:center;"><img src="${item.image||""}" width="70" height="70" style="object-fit:cover;border-radius:4px;flex-shrink:0;" onerror="this.style.display='none'"><div><div style="font-weight:600;font-size:14px;">${item.title}</div><div style="color:#71717a;font-size:12px;margin-top:4px;">Rs. ${item.price} each</div></div></div></td><td style="padding:16px 8px;text-align:center;">${item.quantity}</td><td style="padding:16px 0;text-align:right;font-weight:600;">Rs. ${item.price*item.quantity}</td><td style="padding:16px 0;text-align:right;"><button onclick="vantroRemoveItem(${idx})" style="background:none;border:none;cursor:pointer;color:#71717a;font-size:20px;padding:4px;" title="Remove">×</button></td></tr>`;
                });
                html += `</tbody></table><div style="margin-top:32px;border-top:2px solid #000;padding-top:24px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;"><div><div style="font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:.1em;">Order Total</div><div style="font-size:24px;font-weight:700;margin-top:4px;">Rs. ${total}</div></div><a href="/checkout.html" style="background:#000;color:#fff;padding:16px 40px;text-decoration:none;text-transform:uppercase;font-size:12px;font-weight:700;letter-spacing:.1em;border-radius:4px;">Proceed to Checkout</a></div>`;
                mainArea.innerHTML = html;
            }
        }
        window.vantroRemoveItem = function(idx) { const c = readCart(); c.splice(idx, 1); writeCart(c); location.reload(); };
    }

    // --- CHECKOUT PAGE ---
    if (window.location.pathname === "/checkout" || window.location.pathname.startsWith("/checkout")) {
        const checkCart = readCart();
        if (checkCart.length === 0) {
            alert("Your cart is empty.");
            setTimeout(() => { window.location.href = "/cart"; }, 500);
            return;
        }

        if (!document.getElementById("vantro-checkout-ui")) {
            const mainEl = document.querySelector("main, #MainContent, .main-content, .page-content, body");
            const checkoutHtml = `
            <div id="vantro-checkout-ui" style="max-width:960px;margin:100px auto;padding:0 24px;display:grid;grid-template-columns:1fr 1fr;gap:40px;font-family:inherit;">
              <div>
                <h2 style="font-size:18px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin-bottom:24px;">Delivery Details</h2>
                <form id="checkout-form" novalidate style="display:flex;flex-direction:column;gap:16px;">
                  <div>
                    <label for="chk-name" style="font-size:11px;font-weight:700;color:#71717a;text-transform:uppercase;margin-bottom:6px;display:block;">Full Name *</label>
                    <input id="chk-name" type="text" placeholder="Full Name *" required style="padding:14px;border:1px solid #e4e4e7;border-radius:4px;font-size:14px;width:100%;box-sizing:border-box;">
                  </div>
                  <div>
                    <label for="chk-phone" style="font-size:11px;font-weight:700;color:#71717a;text-transform:uppercase;margin-bottom:6px;display:block;">Mobile Number *</label>
                    <input id="chk-phone" type="tel" placeholder="Mobile Number (10 digits) *" required pattern="[0-9]{10}" maxlength="10" oninput="this.value=this.value.replace(/[^0-9]/g,'').slice(0,10)" style="padding:14px;border:1px solid #e4e4e7;border-radius:4px;font-size:14px;width:100%;box-sizing:border-box;">
                  </div>
                  <div>
                    <label for="chk-email" style="font-size:11px;font-weight:700;color:#71717a;text-transform:uppercase;margin-bottom:6px;display:block;">Email Address (Optional)</label>
                    <input id="chk-email" type="email" placeholder="Email Address (optional)" style="padding:14px;border:1px solid #e4e4e7;border-radius:4px;font-size:14px;width:100%;box-sizing:border-box;">
                  </div>
                  <div>
                    <label for="chk-zip" style="font-size:11px;font-weight:700;color:#71717a;text-transform:uppercase;margin-bottom:6px;display:block;">PIN Code *</label>
                    <input id="chk-zip" type="tel" placeholder="Enter 6-digit PIN Code *" required pattern="[0-9]{6}" maxlength="6" style="padding:14px;border:1px solid #e4e4e7;border-radius:4px;font-size:14px;width:100%;box-sizing:border-box;">
                  </div>
                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div>
                      <label for="chk-state" style="font-size:11px;font-weight:700;color:#71717a;text-transform:uppercase;margin-bottom:6px;display:block;">State *</label>
                      <select id="chk-state" required style="padding:14px;border:1px solid #e4e4e7;border-radius:4px;font-size:14px;width:100%;box-sizing:border-box;background:#f9fafb;">
                        <option value="" disabled selected>Select State *</option>
                      </select>
                    </div>
                    <div>
                      <label for="chk-district" style="font-size:11px;font-weight:700;color:#71717a;text-transform:uppercase;margin-bottom:6px;display:block;">District *</label>
                      <select id="chk-district" required style="padding:14px;border:1px solid #e4e4e7;border-radius:4px;font-size:14px;width:100%;box-sizing:border-box;background:#f9fafb;">
                        <option value="" disabled selected>Select District *</option>
                      </select>
                    </div>
                  </div>
                  <div style="position:relative;">
                    <label for="chk-street" style="font-size:11px;font-weight:700;color:#71717a;text-transform:uppercase;margin-bottom:6px;display:block;">Address *</label>
                    <input id="chk-street" type="text" placeholder="Start typing your address..." autocomplete="off" required style="padding:14px;border:1px solid #e4e4e7;border-radius:4px;font-size:14px;width:100%;box-sizing:border-box;">
                    <div id="address-suggestions" style="position:absolute;top:100%;left:0;right:0;background:#fff;border:1px solid #e4e4e7;border-top:none;border-radius:0 0 4px 4px;z-index:10;max-height:200px;overflow-y:auto;display:none;box-shadow:0 4px 6px rgba(0,0,0,0.1);"></div>
                  </div>
                  <div>
                    <label for="chk-city" style="font-size:11px;font-weight:700;color:#71717a;text-transform:uppercase;margin-bottom:6px;display:block;">City / Town / Village *</label>
                    <input id="chk-city" type="text" placeholder="City / Town / Village *" required style="padding:14px;border:1px solid #e4e4e7;border-radius:4px;font-size:14px;width:100%;box-sizing:border-box;">
                  </div>
                  <button id="btn-pay-now" type="submit" style="background:#000;color:#fff;padding:16px;border:none;border-radius:4px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;cursor:pointer;width:100%;margin-top:8px;">Pay Now</button>
                </form>
              </div>
              <div>
                <h2 style="font-size:18px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin-bottom:24px;">Order Summary</h2>
                <div id="checkout-summary-items" style="display:flex;flex-direction:column;gap:0;"></div>
                <div style="margin-top:24px;padding-top:16px;border-top:2px solid #000;display:flex;justify-content:space-between;align-items:center;">
                  <span style="font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;">Total</span>
                  <span id="checkout-total" style="font-size:20px;font-weight:700;">Rs. 0</span>
                </div>
              </div>
            </div>`;
            if (mainEl) mainEl.innerHTML = checkoutHtml;
        }

        const cart = readCart();
        let total = 0;
        const summaryEl = document.getElementById("checkout-summary-items");
        const totalEl = document.getElementById("checkout-total");
        if (summaryEl) {
            if (cart.length === 0) { summaryEl.innerHTML = "<p>Your cart is empty. <a href='/'>Shop</a></p>"; }
            else {
                let html = "";
                cart.forEach(item => {
                    const itemPrice = parseFloat(item.price) || 0;
                    total += itemPrice * item.quantity;
                    html += `<div style="display:flex;gap:12px;align-items:center;padding:12px 0;border-bottom:1px solid #f4f4f5;"><img src="${item.image||""}" width="56" height="56" style="object-fit:cover;border-radius:4px;flex-shrink:0;" onerror="this.style.display='none'"><div style="flex:1;"><div style="font-size:13px;font-weight:600;">${item.title}</div><div style="color:#71717a;font-size:12px;margin-top:2px;">Qty: ${item.quantity}</div></div><div style="font-weight:700;font-size:14px;">Rs. ${itemPrice*item.quantity}</div></div>`;
                });
                summaryEl.innerHTML = html;
                if (totalEl) totalEl.innerText = `Rs. ${total}`;
            }
        }

        let indiaData = null;
        fetch('/india-districts.json')
            .then(res => res.json())
            .then(data => {
                indiaData = data;
                const stateSelect = document.getElementById("chk-state");
                const districtSelect = document.getElementById("chk-district");
                if (stateSelect && districtSelect && stateSelect.options.length <= 1) {
                    data.states.forEach(s => {
                        const opt = document.createElement('option');
                        opt.value = s.state;
                        opt.text = s.state;
                        stateSelect.add(opt);
                    });

                    stateSelect.addEventListener('change', (e) => {
                        districtSelect.innerHTML = '<option value="" disabled selected>Select District *</option>';
                        const st = data.states.find(s => s.state === e.target.value);
                        if (st && st.districts) {
                            st.districts.forEach(d => {
                                const opt = document.createElement('option');
                                opt.value = d;
                                opt.text = d;
                                districtSelect.add(opt);
                            });
                        }
                    });
                }
            })
            .catch(err => console.error('Failed to load districts JSON:', err));

        // PIN Code Auto-fetch
        const zipInput = document.getElementById("chk-zip");
        if (zipInput) {
            zipInput.addEventListener("input", async (e) => {
                let val = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
                e.target.value = val;
                
                if (val.length === 6 && indiaData) {
                    try {
                        const res = await fetch('https://api.postalpincode.in/pincode/' + val);
                        const data = await res.json();
                        if (data && data[0].Status === 'Success') {
                            const postOffice = data[0].PostOffice[0];
                            const stateName = postOffice.State;
                            const districtName = postOffice.District;
                            
                            const stateSelect = document.getElementById("chk-state");
                            const districtSelect = document.getElementById("chk-district");
                            const cityInput = document.getElementById("chk-city");
                            
                            // Auto-select state
                            let stateMatch = Array.from(stateSelect.options).find(o => o.text.toLowerCase() === stateName.toLowerCase());
                            if (stateMatch) {
                                stateSelect.value = stateMatch.value;
                                // Trigger change to populate districts
                                stateSelect.dispatchEvent(new Event('change'));
                            }
                            
                            // Auto-select district
                            setTimeout(() => {
                                let distMatch = Array.from(districtSelect.options).find(o => o.text.toLowerCase() === districtName.toLowerCase());
                                if (distMatch) {
                                    districtSelect.value = distMatch.value;
                                } else {
                                    const opt = document.createElement('option');
                                    opt.value = districtName;
                                    opt.text = districtName;
                                    districtSelect.add(opt);
                                    districtSelect.value = districtName;
                                }
                            }, 50);
                            
                            // Auto-fill city with Region or Block
                            if (!cityInput.value) {
                                cityInput.value = postOffice.Block || postOffice.Region || postOffice.Name;
                            }
                        }
                    } catch (err) {
                        console.error('Pincode fetch error:', err);
                    }
                }
            });
        }

        // Geoapify Address Autocomplete
        const streetInput = document.getElementById("chk-street");
        const suggestionsBox = document.getElementById("address-suggestions");
        let geoapifyTimeout;
        if (streetInput && suggestionsBox) {
            streetInput.addEventListener("input", (e) => {
                const val = e.target.value;
                if (val.length < 3) {
                    suggestionsBox.style.display = 'none';
                    return;
                }
                clearTimeout(geoapifyTimeout);
                geoapifyTimeout = setTimeout(async () => {
                    try {
                        const apiKey = '36fa05b75aa84c5994c9e050ef718581';
                        const res = await fetch(`https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(val)}&filter=countrycode:in&apiKey=${apiKey}`);
                        const data = await res.json();
                        
                        if (data.features && data.features.length > 0) {
                            suggestionsBox.innerHTML = '';
                            data.features.forEach(f => {
                                const props = f.properties;
                                const item = document.createElement('div');
                                item.style.padding = '10px 14px';
                                item.style.cursor = 'pointer';
                                item.style.borderBottom = '1px solid #f4f4f5';
                                item.style.fontSize = '13px';
                                item.innerText = props.formatted;
                                
                                item.addEventListener('mouseover', () => item.style.background = '#f9fafb');
                                item.addEventListener('mouseout', () => item.style.background = '#fff');
                                
                                item.addEventListener('click', () => {
                                    streetInput.value = props.address_line1 || props.name || props.street || props.formatted.split(',')[0];
                                    suggestionsBox.style.display = 'none';
                                    
                                    const cityInput = document.getElementById("chk-city");
                                    const zipInp = document.getElementById("chk-zip");
                                    if (props.city && !cityInput.value) cityInput.value = props.city;
                                    if (props.postcode && !zipInp.value) {
                                        zipInp.value = props.postcode;
                                        zipInp.dispatchEvent(new Event('input')); // trigger pincode fetch
                                    }
                                });
                                suggestionsBox.appendChild(item);
                            });
                            suggestionsBox.style.display = 'block';
                        } else {
                            suggestionsBox.style.display = 'none';
                        }
                    } catch (err) {
                        console.error('Geoapify error:', err);
                    }
                }, 300);
            });
            
            document.addEventListener("click", (e) => {
                if (e.target !== streetInput && e.target !== suggestionsBox) {
                    suggestionsBox.style.display = 'none';
                }
            });
        }

        const form = document.getElementById("checkout-form");
        if (form) {
            form.addEventListener("submit", async e => {
                e.preventDefault();
                if (cart.length === 0) { showToast("Cart is empty!"); return; }
                const btn = document.getElementById("btn-pay-now");
                const origText = btn?.innerText || "Pay Now";
                if (btn) { btn.innerText = "Processing..."; btn.disabled = true; }
                const name = document.getElementById("chk-name")?.value?.trim();
                const email = document.getElementById("chk-email")?.value?.trim();
                const phone = document.getElementById("chk-phone")?.value?.trim();
                const street = document.getElementById("chk-street")?.value?.trim();
                const city = document.getElementById("chk-city")?.value?.trim();
                const district = document.getElementById("chk-district")?.value?.trim();
                const state = document.getElementById("chk-state")?.value?.trim();
                const zip = document.getElementById("chk-zip")?.value?.trim();
                if (!name||name.length<3){showToast("Enter a valid name.");if(btn){btn.innerText=origText;btn.disabled=false;}return;}
                if (!phone||!/^[6-9]\d{9}$/.test(phone)){showToast("Enter a valid 10-digit Indian mobile number.");if(btn){btn.innerText=origText;btn.disabled=false;}return;}
                if (!street||!city||!district||!state||!zip){showToast("Fill in all address fields.");if(btn){btn.innerText=origText;btn.disabled=false;}return;}
                if (!/^\d{6}$/.test(zip)){showToast("Enter a valid 6-digit PIN code.");if(btn){btn.innerText=origText;btn.disabled=false;}return;}
                const deliveryAddress = {street,city,district,state,zip,country:"India"};
                try {
                    const createRes = await fetch(`${apiBase}/orders/create-razorpay-order`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cart, deliveryAddress})});
                    const createData = await createRes.json();
                    if (!createRes.ok) throw new Error(createData.message||"Order creation failed");
                    if (!window.Razorpay) { await new Promise((res,rej)=>{const s=document.createElement("script");s.src="https://checkout.razorpay.com/v1/checkout.js";s.onload=res;s.onerror=rej;document.head.appendChild(s);}); }
                    const rzp = new window.Razorpay({
                        key:createData.key, amount:createData.amount, currency:createData.currency||"INR",
                        name:"Vantro", description:"Order Payment", order_id:createData.id||createData.order_id,
                        prefill:{name,email:email||"",contact:phone}, theme:{color:"#000000"},
                        handler: async function(response) {
                            try {
                                const vRes = await fetch(`${apiBase}/orders/verify-payment`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({razorpay_order_id:response.razorpay_order_id,razorpay_payment_id:response.razorpay_payment_id,razorpay_signature:response.razorpay_signature,cart,customerName:name,email,phone,deliveryAddress})});
                                const vData = await vRes.json();
                                if (vRes.ok && vData.success) { writeCart([]); window.location.href=`/?order=success&id=${vData.order?.orderId||""}`; }
                                else { showToast(`Verification failed: ${vData.message||"Contact support."}`); if(btn){btn.innerText=origText;btn.disabled=false;} }
                            } catch(err){ showToast("Verification error. Contact support."); if(btn){btn.innerText=origText;btn.disabled=false;} }
                        },
                        modal:{ondismiss:function(){if(btn){btn.innerText=origText;btn.disabled=false;}}}
                    });
                    rzp.open();
                } catch(err){ console.error("[vantro] Checkout error:",err); showToast(err.message||"Checkout failed. Try again."); if(btn){btn.innerText=origText;btn.disabled=false;} }
            });
        }
    }

    // --- TOAST NOTIFICATIONS ---
    window.showToast = function(msg, type = 'error') {
        let container = document.getElementById('vantro-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'vantro-toast-container';
            container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:999999;display:flex;flex-direction:column;gap:10px;';
            document.body.appendChild(container);
        }
        const toast = document.createElement('div');
        toast.style.cssText = `background:${type === 'error' ? '#e74c3c' : '#2ecc71'};color:#fff;padding:12px 20px;border-radius:4px;font-size:14px;font-weight:600;box-shadow:0 4px 6px rgba(0,0,0,0.1);opacity:0;transform:translateY(-20px);transition:all 0.3s ease;`;
        toast.innerText = msg;
        container.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '1'; toast.style.transform = 'translateY(0)'; }, 10);
        setTimeout(() => {
            toast.style.opacity = '0'; toast.style.transform = 'translateY(-20px)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    };

    // --- ORDER SUCCESS BANNER ---
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("order") === "success") {
        const orderId = urlParams.get("id") || "";
        const banner = document.createElement("div");
        banner.style.cssText = "position:fixed;top:0;left:0;right:0;background:#000;color:#fff;text-align:center;padding:16px 24px;z-index:99999;font-size:14px;font-weight:600;";
        banner.innerHTML = `✅ Order placed!${orderId?` ID: <strong>${orderId}</strong>`:""} &nbsp;<a href="/" style="color:#fff;text-decoration:underline;margin-left:12px;">Continue Shopping</a> <button onclick="this.parentElement.remove()" style="background:none;border:none;color:#fff;font-size:18px;cursor:pointer;margin-left:16px;">×</button>`;
        document.body.prepend(banner);
    }

    // --- TRACKING PAGE ---
    if (window.location.pathname === "/track" || window.location.pathname === "/order-tracking") {
        const mainEl = document.querySelector("main, #MainContent, .main-content, .page-content, body");
        if (mainEl) {
            mainEl.innerHTML = `
            <div style="max-width:600px;margin:80px auto;padding:0 24px;font-family:inherit;">
                <h1 style="font-size:24px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin-bottom:24px;text-align:center;">Track Your Order</h1>
                <form id="track-form" style="display:flex;flex-direction:column;gap:16px;">
                    <input id="track-order-id" type="text" placeholder="Order ID (e.g. ORD-12345) *" required style="padding:14px;border:1px solid #e4e4e7;border-radius:4px;font-size:14px;width:100%;box-sizing:border-box;">
                    <input id="track-phone" type="tel" placeholder="Mobile Number used for order *" required style="padding:14px;border:1px solid #e4e4e7;border-radius:4px;font-size:14px;width:100%;box-sizing:border-box;">
                    <button type="submit" id="btn-track" style="background:#000;color:#fff;padding:16px;border:none;border-radius:4px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;cursor:pointer;width:100%;">Track Order</button>
                </form>
                <div id="track-result" style="margin-top:32px;display:none;"></div>
            </div>`;
            
            document.getElementById("track-form").addEventListener("submit", async e => {
                e.preventDefault();
                const orderId = document.getElementById("track-order-id").value.trim();
                const phone = document.getElementById("track-phone").value.trim();
                const btn = document.getElementById("btn-track");
                const resEl = document.getElementById("track-result");
                if (!orderId || !phone) return;
                
                btn.innerText = "Tracking..."; btn.disabled = true;
                try {
                    const res = await fetch(`${apiBase}/orders/track/${encodeURIComponent(orderId)}?phone=${encodeURIComponent(phone)}`);
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.message || "Failed to track order.");
                    
                    const order = data.order;
                    resEl.style.display = "block";
                    resEl.innerHTML = `
                        <div style="padding:24px;border:1px solid #e4e4e7;border-radius:4px;">
                            <div style="display:flex;justify-content:space-between;margin-bottom:16px;">
                                <div><strong style="font-size:18px;">${order.orderId}</strong><div style="font-size:12px;color:#71717a;margin-top:4px;">${new Date(order.date).toLocaleDateString()}</div></div>
                                <div style="text-align:right;"><span style="display:inline-block;padding:4px 8px;background:#f4f4f5;border-radius:4px;font-size:12px;font-weight:600;text-transform:uppercase;">${order.status}</span></div>
                            </div>
                            <div style="margin-bottom:16px;font-size:14px;"><strong>Payment:</strong> ${order.paymentStatus} (Rs. ${order.total})</div>
                            ${order.shippingDetails?.awb ? `<div style="margin-bottom:16px;font-size:14px;"><strong>Tracking AWB:</strong> ${order.shippingDetails.awb} ${order.shippingDetails.courierName ? `(${order.shippingDetails.courierName})` : ''} ${order.shippingDetails.trackingUrl ? `<br><a href="${order.shippingDetails.trackingUrl}" target="_blank" style="color:blue;">Track Shipment</a>` : ''}</div>` : ''}
                            <div style="border-top:1px solid #e4e4e7;padding-top:16px;">
                                ${order.items.map(item => `<div style="display:flex;gap:12px;margin-bottom:12px;align-items:center;"><img src="${item.image||''}" width="40" height="40" style="object-fit:cover;border-radius:4px;background:#f4f4f5;" onerror="this.style.display='none'"><div style="font-size:13px;">${item.name} <span style="color:#71717a">x${item.quantity}</span></div></div>`).join('')}
                            </div>
                        </div>
                    `;
                } catch(err) {
                    resEl.style.display = "block";
                    resEl.innerHTML = `<div style="padding:16px;background:#fee2e2;color:#991b1b;border-radius:4px;font-size:14px;">${err.message}</div>`;
                }
                btn.innerText = "Track Order"; btn.disabled = false;
            });
        }
    }

    // --- REVIEW PAGE ---
    if (window.location.pathname === "/review") {
        const token = new URLSearchParams(window.location.search).get("token");
        const mainEl = document.querySelector("main, #MainContent, .main-content, .page-content, body");
        if (mainEl) {
            if (!token) {
                mainEl.innerHTML = `<div style="text-align:center;padding:80px 24px;font-family:inherit;"><h1 style="font-size:24px;font-weight:700;text-transform:uppercase;margin-bottom:16px;">Review Link Invalid</h1><p style="color:#71717a;">Please use the link provided in your email.</p></div>`;
            } else {
                mainEl.innerHTML = `<div id="review-container" style="max-width:500px;margin:80px auto;padding:0 24px;font-family:inherit;text-align:center;">Loading...</div>`;
                fetch(`${apiBase}/reviews/validate/${encodeURIComponent(token)}`)
                    .then(res => res.json().then(d => ({ok: res.ok, data: d})))
                    .then(({ok, data}) => {
                        if (!ok) {
                            document.getElementById("review-container").innerHTML = `<h1 style="font-size:24px;font-weight:700;text-transform:uppercase;margin-bottom:16px;color:#991b1b;">Oops!</h1><p style="color:#71717a;">${data.error || 'Invalid link'}</p>`;
                            return;
                        }
                        const p = data.product;
                        document.getElementById("review-container").innerHTML = `
                            <h1 style="font-size:22px;font-weight:700;text-transform:uppercase;margin-bottom:24px;">Write a Review</h1>
                            ${p.image ? `<img src="${p.image}" style="width:120px;height:120px;object-fit:cover;border-radius:4px;margin:0 auto 16px;" onerror="this.style.display='none'">` : ''}
                            <div style="font-weight:600;font-size:16px;margin-bottom:24px;">${p.title}</div>
                            <form id="review-form" style="display:flex;flex-direction:column;gap:16px;text-align:left;">
                                <div>
                                    <label style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#71717a;display:block;margin-bottom:8px;">Rating *</label>
                                    <select id="review-rating" required style="padding:14px;border:1px solid #e4e4e7;border-radius:4px;font-size:14px;width:100%;box-sizing:border-box;">
                                        <option value="5">5 - Excellent</option>
                                        <option value="4">4 - Good</option>
                                        <option value="3">3 - Average</option>
                                        <option value="2">2 - Poor</option>
                                        <option value="1">1 - Terrible</option>
                                    </select>
                                </div>
                                <div>
                                    <label style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#71717a;display:block;margin-bottom:8px;">Your Review *</label>
                                    <textarea id="review-text" required rows="4" placeholder="What did you like or dislike?" style="padding:14px;border:1px solid #e4e4e7;border-radius:4px;font-size:14px;width:100%;box-sizing:border-box;resize:vertical;"></textarea>
                                </div>
                                <button type="submit" id="btn-submit-review" style="background:#000;color:#fff;padding:16px;border:none;border-radius:4px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;cursor:pointer;width:100%;margin-top:8px;">Submit Review</button>
                            </form>
                        `;
                        document.getElementById("review-form").addEventListener("submit", async e => {
                            e.preventDefault();
                            const rating = document.getElementById("review-rating").value;
                            const text = document.getElementById("review-text").value.trim();
                            const btn = document.getElementById("btn-submit-review");
                            if (!text) return;
                            
                            btn.innerText = "Submitting..."; btn.disabled = true;
                            try {
                                const sRes = await fetch(`${apiBase}/reviews/submit/${encodeURIComponent(token)}`, {
                                    method: "POST", headers: {"Content-Type": "application/json"},
                                    body: JSON.stringify({rating: parseInt(rating, 10), text})
                                });
                                const sData = await sRes.json();
                                if (!sRes.ok) throw new Error(sData.error || "Failed to submit review.");
                                document.getElementById("review-container").innerHTML = `<h1 style="font-size:24px;font-weight:700;text-transform:uppercase;margin-bottom:16px;color:#166534;">Thank You!</h1><p style="color:#71717a;">Your review has been submitted successfully.</p><div style="margin-top:32px;"><a href="/" style="background:#000;color:#fff;padding:14px 28px;text-decoration:none;text-transform:uppercase;font-size:12px;font-weight:700;letter-spacing:.1em;border-radius:4px;">Continue Shopping</a></div>`;
                            } catch (err) {
                                showToast(err.message);
                                btn.innerText = "Submit Review"; btn.disabled = false;
                            }
                        });
                    })
                    .catch(() => { document.getElementById("review-container").innerHTML = `<p style="color:#991b1b;">Network error. Please try again later.</p>`; });
            }
        }
    }

    // Unhide page
    document.body.classList.add("vantro-loaded");
});
