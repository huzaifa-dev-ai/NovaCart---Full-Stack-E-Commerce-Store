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

  var FADE_MS = 320;        // must match --pdp-swap-dur in style.css
  var COMMIT_GRACE = 200;   // ceiling on the hand-off wait, in ms

  /* url -> Promise. A colour decoded once never pays again, so clicking back
     and forth between two swatches starts fading in the same tick. Failures
     are evicted so a transient blip is retried on the next click. */
  var decoded = Object.create(null);

  /**
   * Resolve only once `url` is fetched AND decoded into a bitmap.
   *
   * ui.preloadVariantImages() already warms the HTTP cache, but it just sets
   * .src and drops the handle: bytes in cache is not the same as ready to
   * paint. Revealing a half-decoded image is worse than not animating at all,
   * so this is the promise the reveal is gated on.
   */
  function warm(url) {
    if (decoded[url]) { return decoded[url]; }

    var p = new Promise(function (resolve, reject) {
      var probe = new Image();
      probe.decoding = "async";

      probe.onload = function () {
        if (typeof probe.decode !== "function") {
          // no decode() here; onload plus real pixels is the best gate we have
          if (probe.naturalWidth > 0) { resolve(); } else { reject(new Error(url)); }
          return;
        }
        probe.decode().then(resolve, function () {
          // a few engines reject decode() for images that paint fine anyway
          if (probe.complete && probe.naturalWidth > 0) { resolve(); }
          else { reject(new Error(url)); }
        });
      };
      probe.onerror = function () { reject(new Error(url)); };
      probe.src = url;                    // set src last, after the handlers
    });

    p.catch(function () { delete decoded[url]; });
    decoded[url] = p;
    return p;
  }

  /**
   * Crossfade controller for the product image.
   *
   *   media  .pdp__media      carries .is-swapping, tinted with the swatch hex
   *   base   #pdpMainImage    in flow, owns alt and data-fallback, never moves
   *   layer  #pdpMediaLayer   absolute, transparent at rest, decorative
   *
   * What makes rapid clicking safe: there is exactly ONE layer and at most one
   * running transition, and the commit reads whatever image is in the layer at
   * the moment it lands rather than a url captured back when it was clicked.
   * The layer is a slot, not a request.
   */
  function createImageSwapper(media, base, layer) {
    var fading = false;      // layer is on screen
    var committing = false;  // handing its image back to `base`
    var token = 0;           // owns the in-flight decode; every request bumps it
    var queued = null;       // one slot, for a click that lands mid-hand-off
    var watchdog = 0;

    function poseReset() {
      // cancel any running fade and snap back to the start pose; the forced
      // reflow flushes it so the NEXT class change actually animates
      layer.classList.add("is-instant");
      layer.classList.remove("is-active");
      void layer.offsetWidth;
      layer.classList.remove("is-instant");
    }

    function commit() {
      if (watchdog) { clearTimeout(watchdog); watchdog = 0; }
      if (!fading || committing) { return; }
      committing = true;

      // Read the layer NOW rather than trusting a url from click time — that
      // is exactly what keeps an interrupted swap consistent.
      var url = layer.getAttribute("src");
      var done = false;
      var finish = function () {
        if (done) { return; }
        done = true;
        poseReset();
        media.classList.remove("is-swapping");
        fading = false;
        committing = false;
        var next = queued;
        queued = null;
        if (next) { request(next.url, next.accent); }
      };

      base.src = url;
      // The bitmap is already decoded, so this settles in a microtask. The
      // timeout only exists so a throttled background tab cannot strand the
      // layer on screen forever.
      if (typeof base.decode === "function") { base.decode().then(finish, finish); }
      else { requestAnimationFrame(function () { requestAnimationFrame(finish); }); }
      setTimeout(finish, COMMIT_GRACE);
    }

    layer.addEventListener("transitionend", function (e) {
      if (e.propertyName === "opacity" && e.target === layer) { commit(); }
    });

    function request(url, accent) {
      if (!url) { return; }
      var mine = ++token;

      // already showing it, and nothing in flight
      if (!fading && !committing && base.getAttribute("src") === url) { return; }

      if (committing) {
        // mid hand-off: park it, one slot only, newest wins
        queued = { url: url, accent: accent };
        return;
      }

      warm(url).then(function () {
        if (mine !== token) { return; }   // a newer click has taken over
        if (accent) { media.style.setProperty("--pdp-swap-accent", accent); }

        // Interrupting a fade that is already up: the layer is opaque and the
        // base is stale underneath, so paint the base with what is currently
        // shown before restarting, or the restart would flash the old colour.
        if (fading) { base.src = layer.getAttribute("src"); }

        layer.src = url;                  // invisible while opacity is 0
        poseReset();
        media.classList.add("is-swapping");
        layer.classList.add("is-active");
        fading = true;

        if (watchdog) { clearTimeout(watchdog); }
        // transitionend can legitimately never arrive: a backgrounded tab, a
        // cancelled transition, a zero duration. Never leave the layer stuck.
        watchdog = setTimeout(commit, FADE_MS + 150);
      }, function () {
        // The variant image is missing. Leave the current picture alone and let
        // the existing data-fallback path deal with it; a broken image is never
        // revealed by the animation.
        if (mine === token && fading) { commit(); }
      });
    }

    return { to: request };
  }

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

  function productTemplate(product, initialColorId) {
    var defaultColorId = initialColorId || product.defaultColorId || (product.colors && product.colors[0] && product.colors[0].id);
    var activeColorObj = (product.colors || []).filter(function (c) { return c.id === defaultColorId; })[0];
    var activeImg = activeColorObj ? activeColorObj.image : product.image;
    var activeStock = activeColorObj ? activeColorObj.stockCount : product.stock;
    var outOfStock = activeColorObj ? (!activeColorObj.inStock || activeStock <= 0) : (product.stock <= 0);

    var stock = stockBadgeHelper(activeStock);
    var maxQty = Math.max(1, activeStock || 99);

    var oldPrice = product.oldPrice
      ? '<span class="pdp__price-was">' + ui.money(product.oldPrice) + "</span>"
      : "";

    var colorSectionHtml = "";
    if (product.colors && product.colors.length) {
      colorSectionHtml =
        '<div class="pdp__color-section">' +
          '<div class="pdp__color-label">Color: <span class="pdp__color-val" id="pdpColorName">' + ui.esc(activeColorObj ? activeColorObj.label : "") + '</span></div>' +
          ui.renderSwatches(product, defaultColorId, "pdp__swatches") +
        '</div>';
    }

    return (
      '<div class="pdp__media">' +
        '<img id="pdpMainImage" src="' + ui.esc(activeImg) + '" data-fallback="' + ui.esc(product.image) + '" alt="' + ui.esc(product.name) + '" fetchpriority="high" />' +
        // Crossfade layer: decorative, invisible at rest, never announced. It
        // deliberately has no data-fallback — the real <img> owns that contract,
        // and a variant that fails to load is abandoned before this is revealed.
        // Seeded with a transparent pixel rather than src="", which would
        // resolve to the page URL and fire a bogus request.
        '<img id="pdpMediaLayer" class="pdp__media-layer" alt="" aria-hidden="true" decoding="async" ' +
          'src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" />' +
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

        colorSectionHtml +

        featureList(product) +

        '<p class="pdp__stock ' + stock.cls + '" id="pdpStockBadge"><span class="pdp__stock-dot" aria-hidden="true"></span><span id="pdpStockLabel">' +
          stock.label +
        "</span></p>" +

        '<div class="pdp__buy">' +
          '<div class="qty" id="qtyWrapper" data-disabled="' + outOfStock + '">' +
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

  function initBuyControls(product, initialColorId) {
    var minus = document.getElementById("qtyMinus");
    var plus = document.getElementById("qtyPlus");
    var input = document.getElementById("qtyInput");
    var addBtn = document.getElementById("addToCart");
    var mainImg = document.getElementById("pdpMainImage");
    var colorNameEl = document.getElementById("pdpColorName");

    // Only crossfade when there is something to crossfade between. A product
    // with one photo never swaps, and if the markup is missing the layer the
    // handler below falls back to a plain src assignment.
    var mediaBox = document.querySelector(".pdp__media");
    var mediaLayer = document.getElementById("pdpMediaLayer");
    var swapper = (mediaBox && mainImg && mediaLayer && (product.colors || []).length > 1)
      ? createImageSwapper(mediaBox, mainImg, mediaLayer)
      : null;

    // Decode this product's other colours up front, so the first click fades
    // immediately instead of pausing while the browser decodes. Idle time only:
    // it must never compete with the photo the shopper is actually looking at.
    if (swapper) {
      var warmRest = function () {
        product.colors.forEach(function (c) {
          if (c.image && c.image !== mainImg.getAttribute("src")) { warm(c.image); }
        });
      };
      if (window.requestIdleCallback) { window.requestIdleCallback(warmRest, { timeout: 2000 }); }
      else { setTimeout(warmRest, 400); }
    }
    var stockBadge = document.getElementById("pdpStockBadge");
    var stockLabel = document.getElementById("pdpStockLabel");
    var qtyWrapper = document.getElementById("qtyWrapper");

    var selectedColorId = initialColorId || product.defaultColorId || (product.colors && product.colors[0] && product.colors[0].id);

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
    if (input) {
      input.addEventListener("change", function () { clampQty(input); });
    }

    if (addBtn) {
      addBtn.addEventListener("click", function () {
        ui.addToCart(product, clampQty(input), addBtn, selectedColorId);
      });
    }

    // Swatch click listener inside PDP
    root.addEventListener("click", function (event) {
      var swatchBtn = event.target.closest(".pdp__swatches .swatch-btn");
      if (!swatchBtn) { return; }

      var colorId = swatchBtn.getAttribute("data-color-id");
      var variant = (product.colors || []).filter(function (c) { return c.id === colorId; })[0];
      if (!variant) { return; }

      selectedColorId = colorId;

      // Crossfade to the new colour. The picture only changes once the new one
      // is decoded, so it never blinks or shows a half-drawn frame; the frame
      // briefly picks up this swatch's own colour while it arrives.
      if (swapper) {
        mainImg.setAttribute("data-fallback", product.image);
        swapper.to(variant.image, variant.swatchHex);
      } else if (mainImg) {
        mainImg.setAttribute("data-fallback", product.image);
        mainImg.src = variant.image;
      }

      // Update label
      if (colorNameEl) { colorNameEl.textContent = variant.label; }

      // Update active swatch state
      var swatches = root.querySelectorAll(".pdp__swatches .swatch-btn");
      swatches.forEach(function (s) {
        var active = s.getAttribute("data-color-id") === colorId;
        s.setAttribute("aria-pressed", String(active));
      });

      // Update stock state & controls
      var isOut = variant.inStock === false || variant.stockCount <= 0;
      var sObj = stockBadgeHelper(variant.stockCount);

      if (stockBadge && stockLabel) {
        stockBadge.className = "pdp__stock " + sObj.cls;
        stockLabel.textContent = sObj.label;
      }

      if (addBtn) {
        addBtn.disabled = isOut;
        addBtn.textContent = isOut ? "Out of Stock" : "Add to Cart";
      }

      if (input) {
        input.disabled = isOut;
        input.max = String(Math.max(1, variant.stockCount || 99));
        clampQty(input);
      }
      if (minus) { minus.disabled = isOut; }
      if (plus) { plus.disabled = isOut; }
      if (qtyWrapper) { qtyWrapper.setAttribute("data-disabled", String(isOut)); }

      // Update URL query parameter without re-loading
      if (window.history && window.history.replaceState) {
        var newUrl = window.location.pathname + "?id=" + product.id + "&color=" + encodeURIComponent(colorId);
        window.history.replaceState(null, "", newUrl);
      }
    });
  }

  function stockBadgeHelper(count) {
    if (count <= 0) { return { label: "Out of Stock", cls: "pdp__stock--out" }; }
    if (count <= 3) { return { label: "Only " + count + " left in stock — order soon", cls: "pdp__stock--low" }; }
    return { label: "In Stock (" + count + " available)", cls: "pdp__stock--in" };
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
    var initialColor = params.get("color");

    App.getProducts()
      .then(function (all) {
        var product = all.filter(function (p) { return p.id === Number(id); })[0];

        if (!product) {
          renderNotFound();
          return;
        }

        ui.preloadVariantImages(all);

        document.title = product.name + " — NovaCart";
        if (crumbName) { crumbName.textContent = product.name; }

        var targetColor = initialColor;
        if (targetColor && (!product.colors || !product.colors.some(function (c) { return c.id === targetColor; }))) {
          targetColor = null;
        }

        root.innerHTML = productTemplate(product, targetColor);
        initBuyControls(product, targetColor);
        renderRelated(product, all);
      })
      .catch(function (err) {
        console.error("NovaCart: failed to load product —", err);
        root.innerHTML =
          '<div class="grid-state">Sorry — we could not load this product. Please refresh the page.</div>';
      });
  });

})(window.NovaCart);
