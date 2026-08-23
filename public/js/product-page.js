/* =============================================================
   NovaCart — Product Details page
   -------------------------------------------------------------
   Reads ?id= from the URL, renders the product, wires the
   quantity selector and Add to Cart, and fills the related
   products grid (same category first, top-rated as fallback).

   Shared helpers come from main.js (App.ui) and cart.js
   (App.Cart); the catalog comes from products.js.
   ============================================================= */

(function (App) {
  "use strict";

  var ui = App.ui;
  var LOW_STOCK = 8;

  var root = document.getElementById("productRoot");
  var relatedSection = document.getElementById("relatedSection");
  var relatedGrid = document.getElementById("relatedGrid");
  var crumbName = document.getElementById("crumbName");

  /* ---------- Render helpers ---------- */

  function stockInfo(product) {
    if (product.stock <= 0) {
      return { cls: "is-out", label: "Out of stock" };
    }
    if (product.stock <= LOW_STOCK) {
      return { cls: "is-low", label: "Low stock — only " + product.stock + " left" };
    }
    return { cls: "is-in", label: "In stock — " + product.stock + " available" };
  }

  function saveChip(product) {
    if (!product.oldPrice || product.oldPrice <= product.price) { return ""; }
    var diff = product.oldPrice - product.price;
    var pct = Math.round((diff / product.oldPrice) * 100);
    return '<span class="pdp__save">Save ' + ui.money(diff) + " (" + pct + "%)</span>";
  }

  function featureList(product) {
    if (!product.features || !product.features.length) { return ""; }
    var items = product.features.map(function (f) {
      return (
        "<li>" +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
          'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>' +
          ui.esc(f) +
        "</li>"
      );
    }).join("");
    return '<ul class="pdp__features">' + items + "</ul>";
  }

  function productTemplate(product) {
    var stock = stockInfo(product);
    var outOfStock = product.stock <= 0;
    var maxQty = Math.min(product.stock, 99);

    var oldPrice = product.oldPrice
      ? '<span class="pdp__price-was">' + ui.money(product.oldPrice) + "</span>"
      : "";

    return (
      '<div class="pdp__media">' +
        '<img src="' + ui.esc(product.image) + '" alt="' + ui.esc(product.name) + '" fetchpriority="high" />' +
      "</div>" +

      '<div class="pdp__info">' +
        '<p class="pdp__category">' + ui.esc(product.category) + "</p>" +

        '<h1 class="pdp__title">' + ui.esc(product.name) + "</h1>" +

        '<div class="pdp__rating">' +
          '<span class="rating">' + ui.starIcon + product.rating.toFixed(1) + "</span>" +
          '<span class="pdp__reviews">' + product.reviews + " reviews</span>" +
        "</div>" +

        '<div class="pdp__price-row">' +
          '<span class="pdp__price">' + ui.money(product.price) + "</span>" +
          oldPrice +
          saveChip(product) +
        "</div>" +

        '<p class="pdp__desc">' + ui.esc(product.description || product.shortDescription) + "</p>" +

        featureList(product) +

        '<p class="pdp__stock ' + stock.cls + '"><span class="pdp__stock-dot" aria-hidden="true"></span>' +
          stock.label +
        "</p>" +

        '<div class="pdp__buy">' +
          '<div class="qty" data-disabled="' + outOfStock + '">' +
            '<button type="button" class="qty__btn" id="qtyMinus" aria-label="Decrease quantity"' + (outOfStock ? " disabled" : "") + ">&minus;</button>" +
            '<input type="number" class="qty__input" id="qtyInput" inputmode="numeric" value="1" min="1" max="' + maxQty + '" aria-label="Quantity"' + (outOfStock ? " disabled" : "") + " />" +
            '<button type="button" class="qty__btn" id="qtyPlus" aria-label="Increase quantity"' + (outOfStock ? " disabled" : "") + ">+</button>" +
          "</div>" +
          '<button type="button" class="btn btn--accent btn--lg pdp__add" id="addToCart"' + (outOfStock ? " disabled" : "") + ">" +
            (outOfStock ? "Out of Stock" : "Add to Cart") +
          "</button>" +
        "</div>" +

        '<ul class="pdp__meta">' +
          "<li><strong>Category</strong><span>" + ui.esc(product.category) + "</span></li>" +
          "<li><strong>Shipping</strong><span>Free on orders $50+</span></li>" +
          "<li><strong>Returns</strong><span>30-day hassle-free</span></li>" +
        "</ul>" +
      "</div>"
    );
  }

  function renderNotFound() {
    document.title = "Product Not Found — NovaCart";
    if (crumbName) { crumbName.textContent = "Not found"; }
    root.innerHTML =
      '<div class="grid-state pdp__empty">' +
        "<h2>Product not found</h2>" +
        "<p>The product you are looking for does not exist or is no longer available.</p>" +
        '<a href="index.html#products" class="btn btn--accent">Browse all products</a>' +
      "</div>";
  }

  /* ---------- Quantity selector ---------- */

  function clampQty(input) {
    var max = Number(input.max) || 99;
    var val = Math.round(Number(input.value));
    if (!val || val < 1) { val = 1; }
    if (val > max) { val = max; }
    input.value = String(val);
    return val;
  }

  function initBuyControls(product) {
    var minus = document.getElementById("qtyMinus");
    var plus = document.getElementById("qtyPlus");
    var input = document.getElementById("qtyInput");
    var addBtn = document.getElementById("addToCart");

    if (!input || !addBtn) { return; }

    if (minus) {
      minus.addEventListener("click", function () {
        input.value = String(Math.max(1, clampQty(input) - 1));
      });
    }
    if (plus) {
      plus.addEventListener("click", function () {
        input.value = String(Math.min(Number(input.max) || 99, clampQty(input) + 1));
      });
    }
    input.addEventListener("change", function () { clampQty(input); });

    addBtn.addEventListener("click", function () {
      // ui.addToCart caps the total in the cart at the product's stock and
      // flashes the button without disabling it (keeps keyboard focus).
      ui.addToCart(product, clampQty(input), addBtn);
    });
  }

  /* ---------- Related products ---------- */

  function renderRelated(product, all) {
    if (!relatedSection || !relatedGrid) { return; }

    var sameCategory = all.filter(function (p) {
      return p.id !== product.id && p.category === product.category;
    });
    var fillers = all
      .filter(function (p) { return p.id !== product.id && p.category !== product.category; })
      .sort(function (a, b) { return b.rating - a.rating; });

    var picks = sameCategory.concat(fillers).slice(0, 4);
    if (!picks.length) { return; }

    relatedGrid.innerHTML = picks.map(ui.productCard).join("");
    relatedSection.hidden = false;

    // reveal-on-scroll uses the same class as the home grid
    relatedGrid.querySelectorAll(".reveal").forEach(function (el) {
      el.classList.add("is-visible");
    });

    // add-to-cart on related cards (delegated)
    relatedGrid.addEventListener("click", function (event) {
      var button = event.target.closest(".js-add-to-cart");
      if (!button || button.disabled) { return; }

      var id = Number(button.getAttribute("data-id"));
      var picked = picks.filter(function (p) { return p.id === id; })[0];
      if (!picked) { return; }

      ui.addToCart(picked, 1, button);
    });
  }

  /* ---------- Init ---------- */

  document.addEventListener("DOMContentLoaded", function () {
    if (!root) { return; }

    var params = new URLSearchParams(window.location.search);
    var id = params.get("id");

    App.getProducts()
      .then(function (all) {
        var product = all.filter(function (p) { return p.id === Number(id); })[0];

        if (!product) {
          renderNotFound();
          return;
        }

        document.title = product.name + " — NovaCart";
        if (crumbName) { crumbName.textContent = product.name; }

        root.innerHTML = productTemplate(product);
        initBuyControls(product);
        renderRelated(product, all);
      })
      .catch(function (err) {
        console.error("NovaCart: failed to load product —", err);
        root.innerHTML =
          '<div class="grid-state">Sorry — we could not load this product. Please refresh the page.</div>';
      });
  });

})(window.NovaCart);
