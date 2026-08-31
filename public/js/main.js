/* =============================================================
   NovaCart — Home / Product Listing page
   -------------------------------------------------------------
   Responsibilities:
     • render the product grid from the catalog
     • keep the navbar cart badge in sync
     • handle "Add to Cart" clicks (event delegation)
     • small UI touches: mobile nav, sticky header, toasts, reveal
   ============================================================= */

(function (App) {
  "use strict";

  /* ---------- Helpers ---------- */

  var $  = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  /** Format a number as USD currency. */
  function money(value) {
    return "$" + Number(value).toFixed(2);
  }

  /** Escape text before it goes into innerHTML — product data may come from an API later. */
  function esc(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* ---------- Toast ---------- */

  var toastEl = $("#toast");
  var toastTimer = null;

  function showToast(message) {
    if (!toastEl) { return; }
    toastEl.textContent = message;
    toastEl.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("is-visible");
    }, 2400);
  }

  /* ---------- Flash messages across navigations ---------- */

  var FLASH_KEY = "novacart.flash";

  /** Queue a toast to be shown once, on the next page that loads. */
  function flash(message) {
    try {
      sessionStorage.setItem(FLASH_KEY, message);
    } catch (err) { /* private mode — the message is simply skipped */ }
  }

  function showPendingFlash() {
    var message;
    try {
      message = sessionStorage.getItem(FLASH_KEY);
      if (message) { sessionStorage.removeItem(FLASH_KEY); }
    } catch (err) { return; }
    if (message) { showToast(message); }
  }

  /**
   * The Google callback is a server redirect, so there's no JSON response
   * to hang a message off -- it marks the landing page with ?signin=google
   * instead. Confirm it, then strip the marker so a refresh doesn't repeat
   * the toast. The text is fixed, never taken from the URL.
   */
  function greetOAuthReturn() {
    var params = new URLSearchParams(window.location.search);
    if (params.get("signin") !== "google") { return; }

    params.delete("signin");
    var rest = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (rest ? "?" + rest : "") + window.location.hash);

    showToast("Signed in with Google");
  }

  /* ---------- Cart badge ---------- */

  function updateCartBadge(bump) {
    var badge = $("#cartCount");
    if (!badge) { return; }

    var count = App.Cart.getCount();
    badge.textContent = count > 99 ? "99+" : String(count);
    badge.setAttribute("data-empty", count === 0 ? "true" : "false");

    if (bump && count > 0) {
      badge.classList.add("is-bumped");
      setTimeout(function () { badge.classList.remove("is-bumped"); }, 250);
    }
  }

  /* ---------- Auth gate for adding to cart ---------- */

  var PENDING_KEY = "novacart.pendingAdd";
  var gateEl = null;
  var gateOpener = null;   // element to restore focus to on close

  /** Remember what the visitor tried to add, so it lands after they sign in. */
  function setPendingAdd(productId, qty, colorId) {
    try {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify({ id: productId, qty: qty || 1, colorId: colorId || null }));
    } catch (err) { /* private mode — they'll just add it again */ }
  }

  function clearPendingAdd() {
    try { sessionStorage.removeItem(PENDING_KEY); } catch (err) { /* ignore */ }
  }

  function buildGate() {
    if (gateEl) { return gateEl; }

    gateEl = document.createElement("div");
    gateEl.className = "modal";
    gateEl.id = "authGate";
    gateEl.setAttribute("role", "dialog");
    gateEl.setAttribute("aria-modal", "true");
    gateEl.setAttribute("aria-labelledby", "authGateTitle");
    gateEl.innerHTML =
      '<div class="modal__scrim" data-close="1"></div>' +
      '<div class="modal__dialog">' +
        '<button type="button" class="modal__close" data-close="1" aria-label="Close">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
        "</button>" +
        '<span class="modal__icon" aria-hidden="true">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
            '<rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>' +
          "</svg>" +
        "</span>" +
        '<h2 class="modal__title" id="authGateTitle">Sign in to continue</h2>' +
        '<p class="modal__text" id="authGateText">Create an account or sign in to keep going.</p>' +
        '<div class="modal__actions">' +
          '<a class="btn btn--accent btn--lg btn--block" id="gateSignIn" href="login.html">Sign In</a>' +
          '<a class="btn btn--outline btn--lg btn--block" id="gateRegister" href="register.html">Create Account</a>' +
        "</div>" +
        '<p class="modal__foot" id="authGateFoot">We\'ll bring you right back here once you\'re in.</p>' +
      "</div>";

    document.body.appendChild(gateEl);

    gateEl.addEventListener("click", function (event) {
      if (event.target.closest("[data-close]")) { closeGate(); }
    });

    // keep tabbing inside the dialog while it's open
    gateEl.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closeGate();
        return;
      }
      if (event.key !== "Tab") { return; }
      var focusable = $$("a[href], button:not([disabled])", gateEl);
      if (!focusable.length) { return; }
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    return gateEl;
  }

  /**
   * @param {Object} [opts]
   * @param {string} [opts.title]   dialog heading
   * @param {string} [opts.message] HTML body copy (already escaped by the caller)
   * @param {string} [opts.foot]    small print under the buttons
   * @param {string} [opts.next]    where to land after signing in; defaults to this page
   */
  function openGate(opts) {
    var options = opts || {};
    var gate = buildGate();
    gateOpener = document.activeElement;

    $("#authGateTitle", gate).textContent = options.title || "Sign in to continue";
    $("#authGateText", gate).innerHTML =
      options.message || "Create an account or sign in to keep going.";
    $("#authGateFoot", gate).textContent =
      options.foot || "We'll bring you right back here once you're in.";

    var next = options.next || currentPageForNext();
    var suffix = next ? "?next=" + encodeURIComponent(next) : "";
    $("#gateSignIn", gate).href = "login.html" + suffix;
    $("#gateRegister", gate).href = "register.html" + suffix;

    gate.classList.add("is-open");
    document.body.style.overflow = "hidden";
    $("#gateSignIn", gate).focus();
  }

  function closeGate() {
    if (!gateEl) { return; }
    gateEl.classList.remove("is-open");
    document.body.style.overflow = "";
    clearPendingAdd();   // they backed out — don't add it on some later sign-in
    if (gateOpener && document.contains(gateOpener)) { gateOpener.focus(); }
    gateOpener = null;
  }

  /** After signing in, finish the add the visitor was blocked on. */
  function resumePendingAdd() {
    if (!App.Auth || !App.Auth.isSignedIn()) { return; }

    var raw;
    try { raw = sessionStorage.getItem(PENDING_KEY); } catch (err) { return; }
    if (!raw) { return; }
    clearPendingAdd();

    var pending;
    try { pending = JSON.parse(raw); } catch (err) { return; }
    if (!pending || !pending.id) { return; }

    App.getProductById(pending.id).then(function (product) {
      if (product) { addToCartGuarded(product, pending.qty, null, pending.colorId); }
    });
  }

  /**
   * The cart belongs to an account, so reaching it needs one. Matched on the
   * destination rather than on individual elements, which covers the navbar
   * cart button and the footer's "Your Cart" link on every page at once.
   */
  var CART_LINK = /^cart\.html(?:[#?].*)?$/i;

  function initCartGate() {
    document.addEventListener("click", function (event) {
      if (!App.Auth || App.Auth.isSignedIn()) { return; }

      var link = event.target.closest("a[href]");
      if (!link) { return; }
      if (!CART_LINK.test(link.getAttribute("href").replace(/^\.?\//, ""))) { return; }

      event.preventDefault();
      event.stopPropagation();

      openGate({
        title: "Sign in to view your cart",
        message: "Your cart is saved to your account — sign in or create one to see what's inside.",
        foot: "It only takes a minute, and we'll bring you straight to your cart.",
        next: "cart.html"
      });
    }, true);
  }

  /* ---------- Add to cart (shared, stock-aware) ---------- */

  /**
   * Confirmation flash that never toggles `disabled`, so keyboard focus
   * stays on the button instead of dropping to <body>.
   */
  function flashButton(button, label) {
    if (button.dataset.busy === "1") { return; }
    button.dataset.busy = "1";
    var original = button.textContent;
    button.textContent = label || "Added ✓";
    setTimeout(function () {
      button.textContent = original;
      delete button.dataset.busy;
    }, 900);
  }

  /**
   * Add to cart, capped at the product's stock across repeated clicks —
   * Cart.add itself accumulates unconditionally, so the ceiling lives here.
   * @returns {number} units actually added
   */
  function addToCartGuarded(product, qty, button, selectedColorId) {
    if (button && button.dataset.busy === "1") { return 0; }
    var colorId = selectedColorId || product.defaultColorId || (product.colors && product.colors[0] && product.colors[0].id);

    // Shopping requires an account — remember the pick and ask them to sign in.
    if (App.Auth && !App.Auth.isSignedIn()) {
      setPendingAdd(product.id, Number(qty) > 0 ? Number(qty) : 1, colorId);
      openGate({
        title: "Sign in to add to cart",
        message: "Sign in or create an account to add <strong>" + esc(product.name) + "</strong> to your cart.",
        foot: "Your selection is saved — we'll drop it straight into your cart once you're in."
      });
      return 0;
    }

    var wanted = Number(qty) > 0 ? Number(qty) : 1;
    var remaining = Math.max(0, product.stock - App.Cart.getQty(product.id, colorId));

    if (remaining <= 0) {
      showToast("Stock limit reached — " + product.name + " has only " + product.stock + " available");
      return 0;
    }

    var amount = Math.min(wanted, remaining);
    App.Cart.add(product.id, amount, colorId);
    updateCartBadge(true);

    var colorObj = (product.colors || []).filter(function (c) { return c.id === colorId; })[0];
    var colorName = colorObj ? (" (" + colorObj.label + ")") : "";

    if (amount < wanted) {
      showToast("Only " + remaining + " left in stock — added " + amount + " to your cart");
    } else {
      showToast((amount > 1 ? amount + " × " : "") + product.name + colorName + " added to your cart");
    }

    if (button) { flashButton(button); }
    return amount;
  }

  /* ---------- Product card ---------- */

  var STAR_ICON =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z"/></svg>';

  /**
   * Shared Color Swatch Selector Component
   * Renders circular swatches with proper ARIA attributes and keyboard accessibility.
   */
  function renderColorSwatches(product, activeColorId, containerClass) {
    if (!product || !product.colors || !product.colors.length) { return ""; }
    var currentActive = activeColorId || product.defaultColorId || (product.colors[0] && product.colors[0].id);

    var swatches = product.colors.map(function (c) {
      var isSelected = c.id === currentActive;
      var isOut = c.inStock === false || c.stockCount <= 0;
      var isLightHex = /^#(?:fff|f[5-9]|e[8-9]|d[8-9])/i.test(c.swatchHex);
      var lightCls = isLightHex ? " swatch-btn--light" : "";

      return (
        '<button type="button" class="swatch-btn' + lightCls + '"' +
        ' data-product-id="' + product.id + '"' +
        ' data-color-id="' + esc(c.id) + '"' +
        ' data-color-label="' + esc(c.label) + '"' +
        ' data-color-image="' + esc(c.image || product.image) + '"' +
        ' data-in-stock="' + (!isOut) + '"' +
        ' style="--swatch-hex: ' + esc(c.swatchHex) + '"' +
        ' aria-label="Select color: ' + esc(c.label) + (isOut ? ' (Out of stock)' : '') + '"' +
        ' aria-pressed="' + isSelected + '"' +
        (isOut ? ' aria-disabled="true"' : '') + '>' +
          '<span class="swatch-btn__check" aria-hidden="true"></span>' +
        '</button>'
      );
    }).join("");

    var cls = containerClass || "card__swatches";
    return '<div class="' + cls + '" role="radiogroup" aria-label="Color options for ' + esc(product.name) + '">' + swatches + '</div>';
  }

  /** Preload variant images so color switching is instant */
  function preloadVariantImages(products) {
    if (!Array.isArray(products)) { return; }
    products.forEach(function (p) {
      if (p.colors) {
        p.colors.forEach(function (c) {
          if (c.image) {
            var img = new Image();
            img.src = c.image;
          }
        });
      }
    });
  }

  /**
   * Offer a card-sized copy of a product photo alongside the full one.
   *
   * A card paints at roughly 270 css px but the photos are 1100px square,
   * because the product page needs that on a retina screen. Handing the grid
   * the big one costs about four times the bytes for pixels nobody sees, so a
   * 550px copy sits next to each photo and the browser picks. Returns "" when
   * there is no thumbnail to point at, leaving plain src behaviour untouched.
   *
   * srcset is a comma-separated list where entries are split on whitespace, and
   * these filenames contain both spaces and parentheses - so both candidates
   * must be percent-encoded or the list parses into nonsense.
   */
  var CARD_SIZES = "(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 280px";

  /** The card-sized copy of a product photo, or null if there isn't one. */
  function thumbUrl(url) {
    if (!url || url.indexOf("/framed/") === -1 || url.indexOf("/thumb/") !== -1) { return null; }
    var cut = url.lastIndexOf("/");
    return url.slice(0, cut) + "/thumb" + url.slice(cut);
  }

  function cardSrcset(url) {
    var thumb = thumbUrl(url);
    if (!thumb) { return ""; }
    return ' srcset="' + esc(encodeURI(thumb)) + " 550w, " + esc(encodeURI(url)) + ' 1100w"' +
      ' sizes="' + CARD_SIZES + '"';
  }

  /**
   * Point an existing card image at `url`, candidates included.
   *
   * Changing .src alone is not enough once srcset is present: the browser keeps
   * choosing from the candidate list and goes on showing the old photo. Any
   * code that swaps a card image has to go through here, or a colour swatch
   * silently displays the wrong colour.
   */
  function setCardImage(img, url) {
    if (!img || !url) { return; }
    var thumb = thumbUrl(url);
    if (thumb) {
      img.setAttribute("srcset", encodeURI(thumb) + " 550w, " + encodeURI(url) + " 1100w");
      img.setAttribute("sizes", CARD_SIZES);
    } else {
      img.removeAttribute("srcset");   // no candidates, so src alone decides
    }
    img.src = url;
  }

  function productCard(product) {
    var outOfStock = product.stock <= 0;
    var activeColorId = product.defaultColorId || (product.colors && product.colors[0] && product.colors[0].id);
    var activeColorObj = (product.colors || []).filter(function (c) { return c.id === activeColorId; })[0];
    var activeImg = activeColorObj ? activeColorObj.image : product.image;

    var tag = "";
    if (outOfStock) {
      tag = '<span class="card__tag card__tag--out">Sold Out</span>';
    } else if (product.badge) {
      var tagClass = product.badge.toLowerCase() === "sale" ? " card__tag--sale" : "";
      tag = '<span class="card__tag' + tagClass + '">' + esc(product.badge) + "</span>";
    }

    var oldPrice = product.oldPrice
      ? '<span class="card__price-was">' + money(product.oldPrice) + "</span>"
      : "";

    var detailsUrl = "product.html?id=" + product.id + (activeColorId ? "&color=" + encodeURIComponent(activeColorId) : "");
    var swatchHtml = renderColorSwatches(product, activeColorId, "card__swatches");

    return (
      '<article class="card reveal' + (outOfStock ? " card--out" : "") + '" data-id="' + product.id + '" data-selected-color="' + esc(activeColorId || "") + '">' +
        '<div class="card__media">' +
          '<a href="' + detailsUrl + '" tabindex="-1" aria-hidden="true">' +
            '<img src="' + esc(activeImg) + '"' + cardSrcset(activeImg) +
              ' data-fallback="' + esc(product.image) + '" alt="' + esc(product.name) +
              '" loading="lazy" decoding="async" />' +
          "</a>" +
          tag +
        "</div>" +

        '<div class="card__body">' +
          '<p class="card__category">' + esc(product.category) + "</p>" +

          '<h3 class="card__title"><a href="' + detailsUrl + '">' + esc(product.name) + "</a></h3>" +

          '<p class="card__desc">' + esc(product.shortDescription) + "</p>" +

          '<div class="card__meta">' +
            '<div class="card__price">' +
              '<span class="card__price-now">' + money(product.price) + "</span>" +
              oldPrice +
            "</div>" +
            '<span class="rating">' + STAR_ICON +
              product.rating.toFixed(1) +
              ' <span class="rating__count">(' + product.reviews + ")</span>" +
            "</span>" +
          "</div>" +

          swatchHtml +

          '<div class="card__actions">' +
            '<a class="btn btn--outline" href="' + detailsUrl + '">View Details</a>' +
            '<button class="btn btn--accent js-add-to-cart" data-id="' + product.id + '"' +
              (outOfStock ? " disabled" : "") + ">" +
              (outOfStock ? "Unavailable" : "Add to Cart") +
            "</button>" +
          "</div>" +
        "</div>" +
      "</article>"
    );
  }

  /* ---------- Render grid ---------- */

  var catalog = [];

  function renderProducts() {
    var grid = $("#productGrid");
    if (!grid) { return; }

    App.getProducts()
      .then(function (products) {
        // the home page shows the featured picks; the full catalog
        // lives on products.html
        var featured = products.filter(function (p) { return p.featured; });
        catalog = featured.length ? featured : products;

        if (!catalog.length) {
          grid.innerHTML = '<div class="grid-state">No products available right now.</div>';
          return;
        }

        grid.innerHTML = catalog.map(productCard).join("");
        tagReveals(grid);
        observeReveals(grid);
      })
      .catch(function (err) {
        console.error("NovaCart: failed to load products —", err);
        grid.innerHTML = '<div class="grid-state">Sorry — we could not load the products. Please refresh the page.</div>';
      });
  }

  /* ---------- Add to cart (delegated) ---------- */

  function handleGridClick(event) {
    var button = event.target.closest(".js-add-to-cart");
    if (!button || button.disabled) { return; }

    var card = button.closest(".card");
    var id = Number(button.getAttribute("data-id"));
    var product = catalog.filter(function (p) { return p.id === id; })[0];
    if (!product) { return; }

    var selectedColorId = card ? card.getAttribute("data-selected-color") : null;
    addToCartGuarded(product, 1, button, selectedColorId);
  }

  function initCardSwatchInteractions() {
    function onSwatchAction(event) {
      var swatchBtn = event.target.closest(".swatch-btn");
      if (!swatchBtn) { return; }

      var card = swatchBtn.closest(".card");
      if (!card) { return; }

      var colorId = swatchBtn.getAttribute("data-color-id");
      var colorImage = swatchBtn.getAttribute("data-color-image");
      var productId = swatchBtn.getAttribute("data-product-id");

      if (!colorId || !colorImage) { return; }

      // Update card thumbnail image. Must go through setCardImage: the card
      // carries a srcset, and assigning .src alone would leave the browser
      // showing the previous colour.
      setCardImage(card.querySelector(".card__media img"), colorImage);

      // Update swatch active pressed attributes
      var swatches = card.querySelectorAll(".swatch-btn");
      swatches.forEach(function (s) {
        var active = s.getAttribute("data-color-id") === colorId;
        s.setAttribute("aria-pressed", String(active));
      });

      // Update selected color attribute on card
      card.setAttribute("data-selected-color", colorId);

      // Update View Details link to carry color query parameter
      var links = card.querySelectorAll('a[href*="product.html"]');
      var newHref = "product.html?id=" + productId + "&color=" + encodeURIComponent(colorId);
      links.forEach(function (l) { l.href = newHref; });
    }

    document.addEventListener("click", onSwatchAction);
    document.addEventListener("mouseover", onSwatchAction);
  }

  /* ---------- Header account menu ---------- */

  /** Pages the user can be sent back to after signing in. */
  function currentPageForNext() {
    var page = window.location.pathname.split("/").pop() || "index.html";
    if (page === "login.html" || page === "register.html") { return ""; }
    return page + window.location.search;
  }

  /**
   * The dashboard shortcut only an administrator sees.
   *
   * A CONVENIENCE, never a gate. /api/admin/* is protected server-side by
   * protect + requireRole("admin"), and admin.html fetches every figure it
   * shows from there — so removing this element changes what is one click
   * away, never what anyone is allowed to reach.
   *
   * Rendered from renderAccount() rather than written into the twelve HTML
   * files that carry a header, which means it inherits every trigger that
   * already keeps the account chip honest: the first paint from cache, the
   * repaint when /api/auth/me answers, a sign-out in another tab, and a
   * back/forward-cache restore.
   */
  function renderAdminLink(user) {
    var actions = $(".header__actions");
    if (!actions) { return; }

    var existing = $("#adminLink");
    var isAdmin = !!(user && user.role === "admin");

    if (!isAdmin) {
      // Covers signing out, and the moment the server contradicts a stale
      // cached user that claimed to be an admin.
      if (existing) { existing.remove(); }
      return;
    }
    if (existing) { return; }   // already shown — leave it rather than thrash

    var link = document.createElement("a");
    link.id = "adminLink";
    link.className = "admin-link";
    link.href = "admin.html";
    link.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/>' +
        '<rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>' +
      "</svg>" +
      '<span class="admin-link__label">Admin</span>';

    // The label is hidden on narrow screens, so the accessible name has to come
    // from somewhere that is never display:none.
    link.setAttribute("aria-label", "Admin dashboard");
    if ((window.location.pathname.split("/").pop() || "") === "admin.html") {
      link.setAttribute("aria-current", "page");
    }

    actions.insertBefore(link, actions.firstChild);
  }

  function renderAccount() {
    var slot = $("#accountSlot");
    if (!slot || !App.Auth) { return; }

    var user = App.Auth.getUser();
    renderAdminLink(user);

    if (!user) {
      var next = currentPageForNext();
      var href = "login.html" + (next ? "?next=" + encodeURIComponent(next) : "");
      slot.innerHTML =
        '<a class="account__link" href="' + href + '">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>' +
          "</svg>" +
          '<span class="account__label">Sign in</span>' +
        "</a>";
      return;
    }

    var initial = (user.name || "?").trim().charAt(0).toUpperCase();
    var first = (user.name || "").trim().split(/\s+/)[0];

    // A Google account brings a profile photo with it. `data-initial` is what
    // the image error handler falls back to, so a revoked or expired URL
    // degrades to the lettered circle instead of a broken-image icon.
    // no-referrer keeps Google from learning which page of the store you are on.
    var avatar = user.avatar
      ? '<span class="account__avatar account__avatar--photo" aria-hidden="true">' +
          '<img src="' + esc(user.avatar) + '" alt="" referrerpolicy="no-referrer" ' +
            'data-initial="' + esc(initial) + '">' +
        "</span>"
      : '<span class="account__avatar" aria-hidden="true">' + esc(initial) + "</span>";

    slot.innerHTML =
      '<button type="button" class="account__btn" id="accountBtn" aria-expanded="false" aria-haspopup="true">' +
        avatar +
        '<span class="account__label">' + esc(first) + "</span>" +
        '<svg class="account__caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>' +
      "</button>" +
      '<div class="account__menu" id="accountMenu" role="menu">' +
        '<div class="account__id">' +
          '<p class="account__name">' + esc(user.name) + "</p>" +
          '<p class="account__email">' + esc(user.email) + "</p>" +
        "</div>" +
        (user.role === "admin"
          ? '<a class="account__item account__item--admin" role="menuitem" href="admin.html">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>' +
              "Admin dashboard</a>"
          : "") +
        '<a class="account__item" role="menuitem" href="cart.html">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 8H6"/><circle cx="10" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/></svg>' +
          "Your cart</a>" +
        '<a class="account__item" role="menuitem" href="orders.html">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/></svg>' +
          "Your orders</a>" +
        '<a class="account__item" role="menuitem" href="orders.html#returns">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 1 3 6.7L3 21"/><path d="M3 21v-5h5"/></svg>' +
          "Returns</a>" +
        '<button type="button" class="account__item account__item--danger" role="menuitem" id="signOutBtn">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>' +
          "Sign out</button>" +
      "</div>";

    var btn = $("#accountBtn");
    var menu = $("#accountMenu");

    // Hover only where hovering is real. A touch device reports no hover, and
    // wiring it there makes the menu open on the tap meant to activate it and
    // then have no way to close.
    var hoverCapable = !!(window.matchMedia &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches);

    function setOpen(open) {
      menu.classList.toggle("is-open", open);
      btn.setAttribute("aria-expanded", String(open));
    }

    btn.addEventListener("click", function (event) {
      event.stopPropagation();
      // On a pointer device the menu is already open from hover, so a toggle
      // here would shut it under the cursor. Opening again is a no-op.
      setOpen(hoverCapable ? true : !menu.classList.contains("is-open"));
    });

    if (hoverCapable) {
      var wrap = btn.parentNode;          // .account, which contains both
      var closeTimer = null;

      var cancelClose = function () {
        window.clearTimeout(closeTimer);
        closeTimer = null;
      };

      var openNow = function () {
        cancelClose();
        setOpen(true);
      };

      // The pointer has to cross a gap between button and menu. The CSS bridge
      // covers it, but a fast diagonal can still clip the corner — this gives
      // the hand a moment to arrive.
      var closeSoon = function () {
        cancelClose();
        closeTimer = window.setTimeout(function () { setOpen(false); }, 220);
      };

      wrap.addEventListener("mouseenter", openNow);
      wrap.addEventListener("mouseleave", closeSoon);

      // Keyboard users get the same behaviour from focus rather than hover.
      wrap.addEventListener("focusin", openNow);
      wrap.addEventListener("focusout", function (event) {
        if (!wrap.contains(event.relatedTarget)) { closeSoon(); }
      });
    }

    $("#signOutBtn").addEventListener("click", function (event) {
      var signOut = event.currentTarget;
      signOut.disabled = true;

      // logout() clears the session server-side, then locally; it resolves
      // even if the request fails, so we never strand the user signed in.
      App.Auth.logout().then(function () {
        // the toast can't survive the navigation, so hand it to the next page
        flash("You're signed out");
        window.location.href = "login.html";
      });
    });
  }

  /** Menu dismissal is bound once, not per render, so it can't stack up. */
  function initAccountMenuDismissal() {
    function closeMenu() {
      var menu = $("#accountMenu");
      var btn = $("#accountBtn");
      if (!menu || !menu.classList.contains("is-open")) { return false; }
      menu.classList.remove("is-open");
      if (btn) { btn.setAttribute("aria-expanded", "false"); }
      return true;
    }

    document.addEventListener("click", function (event) {
      var slot = $("#accountSlot");
      if (slot && !slot.contains(event.target)) { closeMenu(); }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") { return; }
      var btn = $("#accountBtn");
      if (closeMenu() && btn) { btn.focus(); }
    });
  }

  /* ---------- Mobile navigation ---------- */

  function initNav() {
    var toggle = $("#navToggle");
    var nav = $("#primaryNav");
    if (!toggle || !nav) { return; }

    toggle.addEventListener("click", function () {
      var isOpen = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(isOpen));
    });

    // close the menu after tapping a link
    nav.addEventListener("click", function (event) {
      if (event.target.matches(".nav__link")) {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  /**
   * Image fallbacks, bound in JS rather than with an inline onerror
   * attribute — the Content-Security-Policy sets script-src-attr 'none',
   * which blocks inline handlers outright.
   *
   * Uses capture, since the "error" event does not bubble.
   */
  function initImageFallbacks() {
    document.addEventListener(
      "error",
      function (event) {
        var img = event.target;
        if (!img || img.tagName !== "IMG") { return; }

        // An avatar that fails to load drops back to the initial rather than
        // swapping in another image.
        var initial = img.getAttribute("data-initial");
        if (initial !== null) {
          var holder = img.parentNode;
          if (holder) {
            holder.classList.remove("account__avatar--photo");
            holder.textContent = initial;
          }
          return;
        }

        var fallback = img.getAttribute("data-fallback");
        if (!fallback) { return; }

        img.removeAttribute("data-fallback");   // only swap once
        // Drop the candidates as well, or the browser keeps picking from them
        // and the fallback never actually appears.
        img.removeAttribute("srcset");
        img.src = fallback;
      },
      true
    );
  }

  /* ---------- Sticky header shadow ---------- */

  function initStickyHeader() {
    var header = $("#siteHeader");
    if (!header) { return; }          // the auth pages carry no header

    // Never hide within this much of the top: at the top of a page the header
    // is orientation, not clutter.
    var HIDE_AFTER = 90;
    // Ignore movement smaller than this. Trackpads and momentum scrolling
    // deliver a lot of one-pixel jitter, which would otherwise flicker the bar.
    var SETTLE = 6;

    var lastY = window.scrollY;
    var ticking = false;

    // Movement is exactly what this preference asks us to stop doing, so a
    // reader who set it keeps the header where they can see it.
    var mayHide = !(window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches);

    function update() {
      ticking = false;
      var y = window.scrollY;

      header.classList.toggle("is-stuck", y > 8);
      if (!mayHide) { return; }

      // Hiding the bar while its own menu is open would take the menu with it.
      var nav = $("#primaryNav");
      if (nav && nav.classList.contains("is-open")) {
        header.classList.remove("is-hidden");
        lastY = y;
        return;
      }

      var moved = y - lastY;
      // Below the threshold, keep lastY so small movements accumulate rather
      // than being thrown away one frame at a time.
      if (Math.abs(moved) < SETTLE) { return; }

      if (y < HIDE_AFTER || moved < 0) {
        header.classList.remove("is-hidden");
      } else {
        header.classList.add("is-hidden");
      }

      lastY = y;
    }

    function onScroll() {
      if (ticking) { return; }
      ticking = true;
      window.requestAnimationFrame(update);
    }

    window.addEventListener("scroll", onScroll, { passive: true });

    // The bar is faded, not removed from the tab order, so someone tabbing
    // into it would otherwise be focusing links they cannot see.
    header.addEventListener("focusin", function () {
      header.classList.remove("is-hidden");
    });

    update();
  }

  /* ---------- Scroll animations ---------- */

  /*
   * Each page gets its own effect. The name lands on <body data-anim>, and
   * section 11b of the stylesheet keys every variant off that attribute.
   *
   * `sel` lists what is worth animating on that page — block-level content
   * only, never the header, nav or footer. The class is added HERE, at
   * runtime, so the markup never ships hidden: if this script fails the page
   * is simply static, not blank.
   */
  var PAGE_ANIMS = {
    "404": { anim: "strayed", sel: ".co-success, .co-success .cart-empty__icon, .co-success__heading, .co-success p, .co-success .btn" },
    "about": { anim: "broadsheet", sel: ".page-hero__eyebrow, .page-hero__title, .page-hero__sub, .page-body .prose > h2, .page-body .prose > p, .value-card" },
    "admin": { anim: "console", sel: ".page-hero__eyebrow, .page-hero__title, .page-hero__sub, .admin-panel .admin-head, .admin-stats > .admin-stat, .admin-panel > .admin-toolbar, .admin-panel > .admin-table-wrap" },
    "cart": { anim: "tally", sel: ".cart-page__head, .cart-items .cart-item, .cart-items__foot, .cart-empty, .cart-summary:not([hidden])" },
    "checkout": { anim: "converge", sel: ".cart-page__head, .form-card, .co-heading, #checkoutForm > .field, #checkoutForm > .field-row, .co-payment-note, .co-summary, .co-summary .cart-summary__title, .co-items .co-item, .co-empty, .cart-summary__rows, .cart-summary__note" },
    "contact": { anim: "dispatch", sel: ".page-hero__eyebrow, .page-hero__title, .page-hero__sub, .form-card, .form-card .field, .contact-card" },
    "help": { anim: "dossier", sel: ".page-hero__eyebrow, .page-hero__title, .page-hero__sub, .policy-section, .policy-section > p, .policy-section li" },
    "index": { anim: "focuspull", sel: ".hero__eyebrow, .hero__title, .hero__text, .hero__actions, .hero__stats, .hero__visual, .feature, .section__head, .products__more, .product-grid .card" },
    "orders": { anim: "ledger", sel: ".page-hero__eyebrow, .page-hero__title, .page-hero__sub, .acct-tabs, .order-list > .order-card, .order-list > .grid-state" },
    "product": { anim: "unbox", sel: ".pdp__media, .pdp__category, .pdp__title, .pdp__rating, .pdp__price-row, .pdp__desc, .pdp__features, .pdp__stock, .pdp__buy, .pdp__meta, .pdp__related .section__head, .pdp__related .card" },
    "products": { anim: "shelfset", sel: ".catalog__head, .filter-chips, .product-grid .card" },
    "success": { anim: "bloom", sel: ".co-success, .co-success .success-icon, .co-success__heading, .co-success__number, .co-success__hint, .co-success .btn" }
  };

  /** Elements already on screen at load must not animate in from nothing. */
  function inViewport(el) {
    var r = el.getBoundingClientRect();
    return r.top < (window.innerHeight || 0) && r.bottom > 0;
  }

  function initScrollAnims() {
    var file = (window.location.pathname.split("/").pop() || "index.html")
      .replace(/\.html$/, "") || "index";
    var conf = PAGE_ANIMS[file];
    if (!conf) { return; }                 // auth pages and anything unlisted

    document.body.setAttribute("data-anim", conf.anim);

    // Movement is the thing being opted out of. The stylesheet neutralises the
    // variants too, but leaving the class off entirely is cheaper and surer.
    if (window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    tagReveals(document, conf.sel);
    observeReveals(document);
    watchForLateContent();
  }

  /**
   * Orders, the admin panels and the catalog all render after load, so the
   * first pass finds an empty page. Rather than editing each page's script,
   * watch the main region and tag whatever turns up.
   */
  function watchForLateContent() {
    var main = document.querySelector("main");
    if (!main || !("MutationObserver" in window)) { return; }

    var pending = null;
    var observer = new MutationObserver(function () {
      // Debounced: a render that appends fifty cards fires a burst of records,
      // and tagging once at the end is both cheaper and more correct.
      window.clearTimeout(pending);
      pending = window.setTimeout(function () {
        tagReveals(main);
        observeReveals(main);
      }, 90);
    });

    observer.observe(main, { childList: true, subtree: true });
  }

  /**
   * Mark a scope's elements for reveal and number them for stagger.
   *
   * @param {Element|Document} scope
   * @param {string} [selector] defaults to the current page's list
   */
  function tagReveals(scope, selector) {
    var sel = selector || currentAnimSelector;
    if (!sel) { return; }
    currentAnimSelector = sel;

    var groups = {};

    $$(sel, scope === document ? document : scope).forEach(function (el) {
      // Never animate something inside an element that is itself animating —
      // the child would fade in against a parent that is still moving.
      if (el.closest(".reveal") && el.closest(".reveal") !== el) { return; }
      // Hidden panels (an unrevealed success message, an inactive admin tab)
      // never intersect, so a .reveal on them would stick at opacity 0.
      if (el.hidden || el.closest("[hidden]")) { return; }
      // Anything already on screen is simply shown; animating it would mean
      // the page arrives blank and then fills in.
      if (inViewport(el)) { el.classList.add("reveal", "is-visible"); return; }

      el.classList.add("reveal");

      // Stagger restarts inside each parent, so the fortieth card in a grid
      // does not wait two seconds behind the thirty-ninth.
      var key = el.parentNode ? (el.parentNode.__revealKey ||
        (el.parentNode.__revealKey = "g" + (++groupSeq))) : "root";
      groups[key] = (groups[key] || 0);
      // Capped, not raw. A 58-card catalog would otherwise give the last card
      // a 2.5s delay and it would sit invisible long after scrolling into
      // view. Six steps is enough to read as a wave; beyond that they land
      // together.
      el.style.setProperty("--i", String(Math.min(groups[key], STAGGER_CAP)));
      groups[key] += 1;
    });
  }

  var currentAnimSelector = "";
  var groupSeq = 0;

  // The longest stagger any element may wait, in steps of its variant's delay.
  var STAGGER_CAP = 5;

  /* ---------- Reveal on scroll ---------- */

  var revealObserver = null;

  function observeReveals(scope) {
    var items = $$(".reveal", scope || document);

    if (!("IntersectionObserver" in window)) {
      items.forEach(function (el) { el.classList.add("is-visible"); });
      return;
    }

    if (!revealObserver) {
      revealObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            revealObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    }

    items.forEach(function (el) { revealObserver.observe(el); });
  }

  /* ---------- Init ---------- */

  document.addEventListener("DOMContentLoaded", function () {
    var yearEl = $("#year");
    if (yearEl) { yearEl.textContent = new Date().getFullYear(); }

    initNav();
    initImageFallbacks();
    initStickyHeader();
    initCartGate();
    initScrollAnims();
    initAccountMenuDismissal();
    initCardSwatchInteractions();
    renderAccount();

    // The cached user renders instantly; when GET /api/auth/me answers,
    // this repaints with whatever the server actually says.
    document.addEventListener("auth:changed", function () {
      renderAccount();
      resumePendingAdd();
    });
    updateCartBadge(false);
    renderProducts();
    showPendingFlash();
    greetOAuthReturn();
    resumePendingAdd();

    var grid = $("#productGrid");
    if (grid) { grid.addEventListener("click", handleGridClick); }

    // keep the badge correct if the cart changes in another tab
    window.addEventListener("storage", function (event) {
      if (event.key === "novacart.cart") { updateCartBadge(false); }
      if (event.key === "novacart.session") { renderAccount(); }
    });

    // back/forward-cache restores skip DOMContentLoaded — refresh both
    window.addEventListener("pageshow", function () {
      updateCartBadge(false);
      renderAccount();
    });
  });

  // expose small helpers for the other pages (products.html, product.html, cart.html)
  App.ui = {
    money: money,
    esc: esc,
    showToast: showToast,
    updateCartBadge: updateCartBadge,
    productCard: productCard,
    starIcon: STAR_ICON,
    addToCart: addToCartGuarded,
    observeReveals: observeReveals,
    renderSwatches: renderColorSwatches,
    preloadVariantImages: preloadVariantImages,
    tagReveals: tagReveals
  };

})(window.NovaCart);
