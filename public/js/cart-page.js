/* =============================================================
   NovaCart — Cart page (cart.html)
   -------------------------------------------------------------
   Joins the stored cart ({id, qty} in localStorage) with the
   catalog, renders editable line items and the order summary.

   Rules:
     • unknown ids (product removed from catalog) are dropped
     • quantities are clamped to available stock on load
     • out-of-stock items stay visible but are excluded from
       totals until removed
     • shipping: free at $50+, otherwise flat $4.99

   Rendering discipline (review findings): quantity edits patch
   the affected row IN PLACE — a full innerHTML rebuild mid-edit
   detaches the control under the user's pointer (swallowing the
   click) and drops keyboard focus to <body>. Full re-renders
   happen only for structural changes (remove / clear / external
   storage change) and then restore focus deliberately.
   ============================================================= */

(function (App) {
  "use strict";

  var ui = App.ui;

  var FREE_SHIPPING_AT = 50;
  var FLAT_SHIPPING = 4.99;

  var itemsEl = document.getElementById("cartItems");
  var summaryEl = document.getElementById("cartSummary");
  var countEl = document.getElementById("cartPageCount");
  var shipEl = document.getElementById("shipProgress");
  var subtotalEl = document.getElementById("sumSubtotal");
  var shippingEl = document.getElementById("sumShipping");
  var totalEl = document.getElementById("sumTotal");
  var checkoutBtn = document.getElementById("checkoutBtn");

  var catalog = [];

  function byId(id) {
    return catalog.filter(function (p) { return p.id === id; })[0] || null;
  }

  /**
   * Stored cart joined with the catalog.
   * Cleans storage as it goes: unknown ids are dropped, overshooting
   * quantities are clamped to stock.
   */
  function lines() {
    var out = [];
    App.Cart.getItems().forEach(function (item) {
      var product = byId(item.id);
      if (!product) {
        App.Cart.remove(item.id);            // product no longer sold
        return;
      }
      var qty = item.qty;
      if (product.stock > 0 && qty > product.stock) {
        qty = product.stock;                  // stock shrank since adding
        App.Cart.setQty(product.id, qty);
      }
      out.push({ product: product, qty: qty });
    });
    return out;
  }

  /* ---------- Rendering ---------- */

  function lineHtml(line) {
    var p = line.product;
    var unavailable = p.stock <= 0;
    var detailsUrl = "product.html?id=" + p.id;
    var maxQty = Math.min(p.stock, 99);

    return (
      '<article class="cart-item' + (unavailable ? " is-unavailable" : "") + '" data-id="' + p.id + '">' +
        '<a class="cart-item__media" href="' + detailsUrl + '" tabindex="-1" aria-hidden="true">' +
          '<img src="' + ui.esc(p.image) + '" alt="" loading="lazy" />' +
        "</a>" +

        '<div class="cart-item__info">' +
          '<p class="cart-item__category">' + ui.esc(p.category) + "</p>" +
          '<h3 class="cart-item__name"><a href="' + detailsUrl + '">' + ui.esc(p.name) + "</a></h3>" +
          (unavailable
            ? '<p class="cart-item__flag">Out of stock — not included in your total</p>'
            : '<p class="cart-item__unit">' + ui.money(p.price) + " each</p>") +
        "</div>" +

        '<div class="cart-item__qty">' +
          '<div class="qty" data-disabled="' + unavailable + '">' +
            '<button type="button" class="qty__btn js-qty-minus" aria-label="Decrease quantity of ' + ui.esc(p.name) + '"' + (unavailable ? " disabled" : "") + ">&minus;</button>" +
            '<input type="number" class="qty__input js-qty-input" inputmode="numeric" value="' + line.qty + '" min="1" max="' + maxQty + '" aria-label="Quantity of ' + ui.esc(p.name) + '"' + (unavailable ? " disabled" : "") + " />" +
            '<button type="button" class="qty__btn js-qty-plus" aria-label="Increase quantity of ' + ui.esc(p.name) + '"' + (unavailable ? " disabled" : "") + ">+</button>" +
          "</div>" +
        "</div>" +

        '<p class="cart-item__total">' + (unavailable ? "—" : ui.money(p.price * line.qty)) + "</p>" +

        '<button type="button" class="cart-item__remove js-remove" aria-label="Remove ' + ui.esc(p.name) + ' from cart">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
        "</button>" +
      "</article>"
    );
  }

  function emptyHtml() {
    return (
      '<div class="cart-empty">' +
        '<span class="cart-empty__icon" aria-hidden="true">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 8H6"/><circle cx="10" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/></svg>' +
        "</span>" +
        "<h2>Your cart is empty</h2>" +
        "<p>Browse the catalog and add something you like — it will show up here.</p>" +
        '<a href="products.html" class="btn btn--accent btn--lg">Browse Products <span class="btn__arrow" aria-hidden="true">&rarr;</span></a>' +
      "</div>"
    );
  }

  function shipProgressHtml(subtotal) {
    if (subtotal <= 0) { return ""; }
    if (subtotal >= FREE_SHIPPING_AT) {
      return '<p class="ship-note is-unlocked">You have unlocked <strong>free shipping</strong></p>';
    }
    var away = FREE_SHIPPING_AT - subtotal;
    var pct = Math.round((subtotal / FREE_SHIPPING_AT) * 100);
    return (
      '<p class="ship-note">Add <strong>' + ui.money(away) + "</strong> more for free shipping</p>" +
      '<div class="ship-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="Progress towards free shipping">' +
        '<span class="ship-bar__fill" style="width:' + pct + '%"></span>' +
      "</div>"
    );
  }

  /**
   * Badge, count line, summary and checkout state — runs on EVERY change,
   * including the path where the cart just became empty (a review finding:
   * an early return used to leave the navbar badge stale).
   */
  function paintTotals(all) {
    var payable = all.filter(function (l) { return l.product.stock > 0; });

    // count every unit, including out-of-stock lines — matches the navbar badge
    var unitCount = all.reduce(function (s, l) { return s + l.qty; }, 0);
    countEl.textContent = all.length
      ? unitCount + (unitCount === 1 ? " item" : " items") + " in your cart"
      : "";

    var subtotal = payable.reduce(function (s, l) { return s + l.product.price * l.qty; }, 0);
    var shipping = subtotal === 0 ? 0 : (subtotal >= FREE_SHIPPING_AT ? 0 : FLAT_SHIPPING);

    shipEl.innerHTML = shipProgressHtml(subtotal);
    subtotalEl.textContent = ui.money(subtotal);
    shippingEl.textContent = subtotal === 0 ? "—" : (shipping === 0 ? "Free" : ui.money(shipping));
    totalEl.textContent = ui.money(subtotal + shipping);
    summaryEl.hidden = all.length === 0;

    // nothing payable (only out-of-stock lines) -> checkout goes nowhere
    var checkoutBlocked = subtotal <= 0;
    checkoutBtn.classList.toggle("is-disabled", checkoutBlocked);
    checkoutBtn.setAttribute("aria-disabled", String(checkoutBlocked));
    if (checkoutBlocked) { checkoutBtn.setAttribute("tabindex", "-1"); }
    else { checkoutBtn.removeAttribute("tabindex"); }

    ui.updateCartBadge(false);
    return payable;
  }

  /**
   * Full structural rebuild. `focusHint` restores keyboard focus afterwards:
   *   { removeIndex: n } — a line was removed; focus the nearest remove button
   * Without a hint, focus on a qty control is restored to the same line.
   */
  function render(focusHint) {
    var restore = null;
    var active = document.activeElement;
    if (!focusHint && active && itemsEl.contains(active)) {
      var row = active.closest(".cart-item");
      var cls = ["js-qty-input", "js-qty-plus", "js-qty-minus", "js-remove"].filter(function (c) {
        return active.classList.contains(c);
      })[0];
      if (row && cls) { restore = { id: row.getAttribute("data-id"), cls: cls }; }
    }

    var all = lines();
    paintTotals(all);

    if (!all.length) {
      itemsEl.innerHTML = emptyHtml();
      if (focusHint) {
        var cta = itemsEl.querySelector(".cart-empty .btn");
        if (cta) { cta.focus(); }
      }
      return;
    }

    itemsEl.innerHTML =
      all.map(lineHtml).join("") +
      '<div class="cart-items__foot">' +
        '<button type="button" class="cart-clear js-clear-cart">Clear cart</button>' +
      "</div>";

    if (focusHint && typeof focusHint.removeIndex === "number") {
      var removes = itemsEl.querySelectorAll(".js-remove");
      var target = removes[Math.min(focusHint.removeIndex, removes.length - 1)];
      if (target) { target.focus(); }
    } else if (restore) {
      var el = itemsEl.querySelector('.cart-item[data-id="' + restore.id + '"] .' + restore.cls);
      if (el) {
        el.focus();
        if (restore.cls === "js-qty-input") { try { el.select(); } catch (err) { /* ignore */ } }
      }
    }
  }

  /**
   * Quantity-only change: patch the row in place. No innerHTML rebuild,
   * so the focused control survives and concurrent clicks land.
   */
  function patchLine(row, product, qty) {
    var input = row.querySelector(".js-qty-input");
    if (input && Number(input.value) !== qty) { input.value = String(qty); }
    var totalCell = row.querySelector(".cart-item__total");
    if (totalCell) { totalCell.textContent = ui.money(product.price * qty); }
    paintTotals(lines());
  }

  /* ---------- Events (delegated) ---------- */

  function lineFromEvent(event) {
    var row = event.target.closest(".cart-item");
    if (!row) { return null; }
    var product = byId(Number(row.getAttribute("data-id")));
    if (!product) { return null; }
    return { row: row, product: product };
  }

  function onItemsClick(event) {
    if (event.target.closest(".js-clear-cart")) {
      App.Cart.clear();
      ui.showToast("Cart cleared");
      render({});
      return;
    }

    var ctx = lineFromEvent(event);
    if (!ctx) { return; }
    var id = ctx.product.id;
    var current = App.Cart.getQty(id);

    if (event.target.closest(".js-remove")) {
      var rows = Array.prototype.slice.call(itemsEl.querySelectorAll(".cart-item"));
      var index = rows.indexOf(ctx.row);
      App.Cart.remove(id);
      ui.showToast(ctx.product.name + " removed from your cart");
      render({ removeIndex: index });
    } else if (event.target.closest(".js-qty-plus")) {
      if (current >= ctx.product.stock) {
        ui.showToast("Only " + ctx.product.stock + " in stock");
        return;
      }
      App.Cart.setQty(id, current + 1);
      patchLine(ctx.row, ctx.product, current + 1);
    } else if (event.target.closest(".js-qty-minus")) {
      if (current <= 1) { return; }         // use the remove button to delete
      App.Cart.setQty(id, current - 1);
      patchLine(ctx.row, ctx.product, current - 1);
    }
  }

  function onItemsChange(event) {
    var input = event.target.closest(".js-qty-input");
    if (!input) { return; }
    var ctx = lineFromEvent(event);
    if (!ctx) { return; }

    var max = Math.min(ctx.product.stock, 99);
    var val = Math.round(Number(input.value));
    if (!val || val < 1) { val = 1; }
    if (val > max) {
      val = max;
      ui.showToast("Only " + ctx.product.stock + " in stock");
    }
    App.Cart.setQty(ctx.product.id, val);
    patchLine(ctx.row, ctx.product, val);
  }

  /* ---------- Init ---------- */

  document.addEventListener("DOMContentLoaded", function () {
    if (!itemsEl) { return; }

    App.getProducts()
      .then(function (products) {
        catalog = products;
        render();
      })
      .catch(function (err) {
        console.error("NovaCart: failed to load cart —", err);
        itemsEl.innerHTML = '<div class="grid-state">Sorry — we could not load your cart. Please refresh the page.</div>';
      });

    itemsEl.addEventListener("click", onItemsClick);
    itemsEl.addEventListener("change", onItemsChange);

    // another tab changed the cart — re-render with fresh storage
    window.addEventListener("storage", function (event) {
      if (event.key === "novacart.cart" && catalog.length) { render(); }
    });

    // bfcache back-navigation restores a stale DOM snapshot — rebuild it
    window.addEventListener("pageshow", function (event) {
      if (event.persisted && catalog.length) { render(); }
    });
  });

})(window.NovaCart);
