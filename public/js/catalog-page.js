/* =============================================================
   NovaCart — Full Catalog page (products.html)
   -------------------------------------------------------------
   Renders every product with client-side category filtering.
   Shared helpers come from main.js (App.ui) and cart.js.
   ============================================================= */

(function (App) {
  "use strict";

  var ui = App.ui;

  var grid = document.getElementById("catalogGrid");
  var chipsRow = document.getElementById("filterChips");
  var countEl = document.getElementById("catalogCount");

  var all = [];
  var activeCategory = "All";

  // ?badge=New (or Sale) narrows the whole page, e.g. the footer's
  // "New Arrivals" link. Any chip click clears it back to the full catalog.
  var badgeParam = new URLSearchParams(window.location.search).get("badge");
  var badgeFilter = (badgeParam === "New" || badgeParam === "Sale") ? badgeParam : null;

  /* ---------- Filters ---------- */

  function base() {
    if (!badgeFilter) { return all; }
    return all.filter(function (p) { return p.badge === badgeFilter; });
  }

  function categories() {
    var seen = [];
    base().forEach(function (p) {
      if (seen.indexOf(p.category) === -1) { seen.push(p.category); }
    });
    return seen;
  }

  function chipHtml(label, count, isActive) {
    return (
      '<button type="button" class="chip' + (isActive ? " is-active" : "") + '"' +
      ' data-category="' + ui.esc(label) + '" aria-pressed="' + isActive + '">' +
        ui.esc(label) +
        '<span class="chip__count">' + count + "</span>" +
      "</button>"
    );
  }

  function renderChips() {
    var pool = base();
    var html = chipHtml("All", pool.length, activeCategory === "All");
    categories().forEach(function (cat) {
      var count = pool.filter(function (p) { return p.category === cat; }).length;
      html += chipHtml(cat, count, activeCategory === cat);
    });
    chipsRow.innerHTML = html;
  }

  /* ---------- Grid ---------- */

  function visibleProducts() {
    var pool = base();
    if (activeCategory === "All") { return pool; }
    return pool.filter(function (p) { return p.category === activeCategory; });
  }

  function renderGrid() {
    var list = visibleProducts();

    if (!list.length) {
      grid.innerHTML = '<div class="grid-state">No products in this category yet.</div>';
      return;
    }

    grid.innerHTML = list.map(ui.productCard).join("");
    ui.observeReveals(grid);
  }

  function renderCount() {
    var list = visibleProducts();
    var scope = badgeFilter === "New" ? " new arrivals" : (badgeFilter === "Sale" ? " sale items" : " products");
    countEl.innerHTML =
      "Showing <strong>" + list.length + "</strong> of <strong>" + base().length + "</strong>" + scope +
      (activeCategory === "All" ? "" : " in <strong>" + ui.esc(activeCategory) + "</strong>") +
      (badgeFilter ? ' &middot; <a href="products.html">view the full catalog</a>' : "");
  }

  /* ---------- Events ---------- */

  function onChipClick(event) {
    var chip = event.target.closest(".chip");
    if (!chip) { return; }

    activeCategory = chip.getAttribute("data-category");
    if (badgeFilter) {
      badgeFilter = null;   // chips always operate on the full catalog
      window.history.replaceState(null, "", window.location.pathname);
    }
    renderChips();
    renderGrid();
    renderCount();
  }

  function onGridClick(event) {
    var button = event.target.closest(".js-add-to-cart");
    if (!button || button.disabled) { return; }

    var id = Number(button.getAttribute("data-id"));
    var product = all.filter(function (p) { return p.id === id; })[0];
    if (!product) { return; }

    ui.addToCart(product, 1, button);
  }

  /* ---------- Init ---------- */

  document.addEventListener("DOMContentLoaded", function () {
    if (!grid) { return; }

    App.getProducts()
      .then(function (products) {
        all = products;
        renderChips();
        renderGrid();
        renderCount();
      })
      .catch(function (err) {
        console.error("NovaCart: failed to load catalog —", err);
        grid.innerHTML = '<div class="grid-state">Sorry — we could not load the catalog. Please refresh the page.</div>';
      });

    chipsRow.addEventListener("click", onChipClick);
    grid.addEventListener("click", onGridClick);
  });

})(window.NovaCart);
