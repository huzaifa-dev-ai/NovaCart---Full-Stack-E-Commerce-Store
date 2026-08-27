/* =============================================================
   NovaCart — Checkout page (checkout.html)
   -------------------------------------------------------------
   Left column collects customer information; the right column
   summarises the payable cart. Placing an order validates the
   form, records the order, empties the cart and shows the
   confirmation panel.

   Orders are placed through POST /api/orders. The request carries
   product ids and quantities only — the server prices the order,
   reserves stock and assigns the order number, so nothing about
   the money is decided in the browser.

   Same cart rules as cart.html: unknown ids are dropped, stored
   quantities are clamped to stock, out-of-stock lines are
   excluded from the order.
   ============================================================= */

(function (App) {
  "use strict";

  var ui = App.ui;

  var FREE_SHIPPING_AT = 50;
  var FLAT_SHIPPING = 4.99;

  var layoutEl = document.getElementById("checkoutLayout");
  var countEl = document.getElementById("checkoutCount");
  var itemsEl = document.getElementById("coItems");
  var subtotalEl = document.getElementById("coSubtotal");
  var shippingEl = document.getElementById("coShipping");
  var totalEl = document.getElementById("coTotal");
  var form = document.getElementById("checkoutForm");
  var placeBtn = document.getElementById("placeOrderBtn");

  var catalog = [];

  /* ---------- Cart join (same rules as the cart page) ---------- */

  function payableLines() {
    var out = [];
    App.Cart.getItems().forEach(function (item) {
      var product = catalog.filter(function (p) { return p.id === item.id; })[0];
      if (!product) {
        App.Cart.remove(item.id, item.colorId);
        return;
      }
      var colorId = item.colorId || product.defaultColorId || (product.colors && product.colors[0] && product.colors[0].id);
      var colorObj = (product.colors || []).filter(function (c) { return c.id === colorId; })[0];

      var stock = colorObj ? colorObj.stockCount : product.stock;
      var inStock = colorObj ? (colorObj.inStock && stock > 0) : (product.stock > 0);

      if (!inStock) { return; }   // can't order what isn't in stock
      var qty = Math.min(item.qty, stock);
      if (qty !== item.qty) { App.Cart.setQty(product.id, qty, colorId); }
      out.push({ product: product, colorId: colorId, colorObj: colorObj, qty: qty });
    });
    return out;
  }

  function totalsOf(lines) {
    var subtotal = lines.reduce(function (s, l) { return s + l.product.price * l.qty; }, 0);
    var shipping = subtotal === 0 ? 0 : (subtotal >= FREE_SHIPPING_AT ? 0 : FLAT_SHIPPING);
    return { subtotal: subtotal, shipping: shipping, total: subtotal + shipping };
  }

  /* ---------- Summary rendering ---------- */

  function itemHtml(line) {
    var p = line.product;
    var colorObj = line.colorObj;
    var itemImg = colorObj ? colorObj.image : p.image;
    var colorBadge = colorObj ? (' <span style="color:var(--indigo-600); font-weight:600;">(' + ui.esc(colorObj.label) + ')</span>') : '';

    return (
      '<div class="co-item">' +
        '<span class="co-item__media"><img src="' + ui.esc(itemImg) + '" data-fallback="' + ui.esc(p.image) + '" alt="" loading="lazy" />' +
          '<span class="co-item__qty" aria-hidden="true">' + line.qty + "</span>" +
        "</span>" +
        '<span class="co-item__info">' +
          '<span class="co-item__name">' + ui.esc(p.name) + colorBadge + "</span>" +
          '<span class="co-item__unit">' + line.qty + " × " + ui.money(p.price) + "</span>" +
        "</span>" +
        '<span class="co-item__total">' + ui.money(p.price * line.qty) + "</span>" +
      "</div>"
    );
  }

  function renderSummary() {
    var lines = payableLines();

    if (!lines.length) {
      itemsEl.innerHTML =
        '<div class="co-empty">' +
          "<p>There is nothing to check out yet.</p>" +
          '<a href="products.html" class="btn btn--outline">Browse Products</a>' +
        "</div>";
      countEl.textContent = "";
      subtotalEl.textContent = ui.money(0);
      shippingEl.textContent = "—";
      totalEl.textContent = ui.money(0);
      placeBtn.classList.add("is-disabled");
      placeBtn.setAttribute("aria-disabled", "true");
      placeBtn.disabled = true;
      return lines;
    }

    var units = lines.reduce(function (s, l) { return s + l.qty; }, 0);
    countEl.textContent = "You're ordering " + units + (units === 1 ? " item" : " items");

    itemsEl.innerHTML = lines.map(itemHtml).join("");

    var t = totalsOf(lines);
    subtotalEl.textContent = ui.money(t.subtotal);
    shippingEl.textContent = t.shipping === 0 ? "Free" : ui.money(t.shipping);
    totalEl.textContent = ui.money(t.total);

    placeBtn.classList.remove("is-disabled");
    placeBtn.removeAttribute("aria-disabled");
    placeBtn.disabled = false;
    return lines;
  }

  /* ---------- Validation ---------- */

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var POSTAL_RE = /^[A-Za-z0-9][A-Za-z0-9\s-]{2,9}$/;

  function phoneOk(value) {
    var digits = value.replace(/[\s()+-]/g, "");
    return /^\d{7,15}$/.test(digits) && /^[+]?[\d\s()-]+$/.test(value.trim());
  }

  function setInvalid(input, invalid) {
    input.closest(".field").classList.toggle("is-invalid", invalid);
    input.setAttribute("aria-invalid", String(invalid));
    return !invalid;
  }

  function validate() {
    var name = document.getElementById("coName");
    var email = document.getElementById("coEmail");
    var phone = document.getElementById("coPhone");
    var address = document.getElementById("coAddress");
    var city = document.getElementById("coCity");
    var postal = document.getElementById("coPostal");

    var ok = true;
    ok = setInvalid(name, name.value.trim().length < 3) && ok;
    ok = setInvalid(email, !EMAIL_RE.test(email.value.trim())) && ok;
    ok = setInvalid(phone, !phoneOk(phone.value)) && ok;
    ok = setInvalid(address, address.value.trim().length < 5) && ok;
    ok = setInvalid(city, city.value.trim().length < 2) && ok;
    ok = setInvalid(postal, !POSTAL_RE.test(postal.value.trim())) && ok;

    var firstBad = form.querySelector('[aria-invalid="true"]');
    if (firstBad) { firstBad.focus(); }
    return ok;
  }

  /* ---------- Order processing ---------- */

  function apiBase() {
    if (window.location.port === "5500") { return "http://localhost:5000/api"; }
    return "/api";
  }

  /**
   * POST the order to the server, which prices it, reserves stock and
   * assigns the order number.
   *
   * The payload carries product ids and quantities ONLY — no prices and
   * no totals. The server recomputes all of it from the database, so a
   * tampered request cannot buy anything for a penny.
   *
   * @returns {Promise<Object>} the created order
   */
  function submitOrder(payload) {
    return fetch(apiBase() + "/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload)
    })
      .catch(function () {
        var error = new Error("Can't reach the NovaCart server. Please try again.");
        error.code = "NETWORK";
        throw error;
      })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          if (!response.ok) {
            var error = new Error(data.error || "We couldn't place your order.");
            error.status = response.status;
            error.code = data.code;
            error.errors = data.errors || [];
            throw error;
          }
          return data.order;
        });
      });
  }

  /** Server validation paths ("customer.email") -> the input's id. */
  var FIELD_IDS = {
    "customer.name": "coName",
    "customer.email": "coEmail",
    "customer.phone": "coPhone",
    "customer.address": "coAddress",
    "customer.city": "coCity",
    "customer.postal": "coPostal"
  };

  function showOrderError(error) {
    var focused = null;

    (error.errors || []).forEach(function (item) {
      var input = document.getElementById(FIELD_IDS[item.field]);
      if (!input) { return; }
      var field = input.closest(".field");
      field.classList.add("is-invalid");
      var hint = field.querySelector(".field-error");
      if (hint && item.message) { hint.textContent = item.message; }
      input.setAttribute("aria-invalid", "true");
      if (!focused) { focused = input; }
    });

    if (focused) {
      focused.focus();
    } else {
      ui.showToast(error.message);
    }

    // Stock ran out between loading the page and pressing the button —
    // repaint the summary so the customer sees the corrected cart.
    if (error.code === "INSUFFICIENT_STOCK" || error.code === "PRODUCT_UNAVAILABLE") {
      App.getProducts().then(function () { renderSummary(); });
    }
  }

  function placeOrder() {
    var lines = payableLines();
    if (!lines.length) { return; }

    var payload = {
      customer: {
        name: document.getElementById("coName").value.trim(),
        email: document.getElementById("coEmail").value.trim(),
        phone: document.getElementById("coPhone").value.trim(),
        address: document.getElementById("coAddress").value.trim(),
        city: document.getElementById("coCity").value.trim(),
        postal: document.getElementById("coPostal").value.trim()
      },
      items: lines.map(function (l) {
        return { id: l.product.id, colorId: l.colorId || null, qty: l.qty };
      })
    };

    placeBtn.disabled = true;
    placeBtn.textContent = "Placing order…";

    submitOrder(payload)
      .then(function (order) {
        App.Cart.clear();
        window.location.href = "success.html?order=" + encodeURIComponent(order.number);
      })
      .catch(function (error) {
        showOrderError(error);
        placeBtn.disabled = false;
        placeBtn.innerHTML = 'Place Order <span class="btn__arrow" aria-hidden="true">&rarr;</span>';
      });
  }

  /* ---------- Init ---------- */

  document.addEventListener("DOMContentLoaded", function () {
    if (!form) { return; }

    placeBtn.disabled = true;   // until the catalog is in

    App.getProducts()
      .then(function (products) {
        catalog = products;
        renderSummary();
      })
      .catch(function (err) {
        console.error("NovaCart: failed to load checkout —", err);
        itemsEl.innerHTML = '<div class="grid-state">Sorry — we could not load your order. Please refresh the page.</div>';
      });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!catalog.length || placeBtn.disabled) { return; }
      if (!validate()) { return; }
      placeOrder();
    });

    form.addEventListener("input", function (event) {
      var field = event.target.closest(".field");
      if (field) { field.classList.remove("is-invalid"); }
    });

    // cart changed in another tab while standing at checkout
    window.addEventListener("storage", function (event) {
      if (event.key === "novacart.cart" && catalog.length) { renderSummary(); }
    });

    window.addEventListener("pageshow", function (event) {
      if (event.persisted && catalog.length) { renderSummary(); }
    });
  });

})(window.NovaCart);
