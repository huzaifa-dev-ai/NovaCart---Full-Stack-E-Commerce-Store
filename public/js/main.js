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
  function setPendingAdd(productId, qty) {
    try {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify({ id: productId, qty: qty || 1 }));
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
      if (product) { addToCartGuarded(product, pending.qty, null); }
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
  function addToCartGuarded(product, qty, button) {
    if (button && button.dataset.busy === "1") { return 0; }

    // Shopping requires an account — remember the pick and ask them to sign in.
    if (App.Auth && !App.Auth.isSignedIn()) {
      setPendingAdd(product.id, Number(qty) > 0 ? Number(qty) : 1);
      openGate({
        title: "Sign in to add to cart",
        message: "Sign in or create an account to add <strong>" + esc(product.name) + "</strong> to your cart.",
        foot: "Your selection is saved — we'll drop it straight into your cart once you're in."
      });
      return 0;
    }

    var wanted = Number(qty) > 0 ? Number(qty) : 1;
    var remaining = Math.max(0, product.stock - App.Cart.getQty(product.id));

    if (remaining <= 0) {
      showToast("Stock limit reached — " + product.name + " has only " + product.stock + " available");
      return 0;
    }

    var amount = Math.min(wanted, remaining);
    App.Cart.add(product.id, amount);
    updateCartBadge(true);

    if (amount < wanted) {
      showToast("Only " + remaining + " left in stock — added " + amount + " to your cart");
    } else {
      showToast((amount > 1 ? amount + " × " : "") + product.name + " added to your cart");
    }

    if (button) { flashButton(button); }
    return amount;
  }

  /* ---------- Product card ---------- */

  var STAR_ICON =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z"/></svg>';

  function productCard(product) {
    var outOfStock = product.stock <= 0;

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

    var detailsUrl = "product.html?id=" + product.id;

    return (
      '<article class="card reveal' + (outOfStock ? " card--out" : "") + '" data-id="' + product.id + '">' +
        '<div class="card__media">' +
          '<a href="' + detailsUrl + '" tabindex="-1" aria-hidden="true">' +
            '<img src="' + esc(product.image) + '" alt="' + esc(product.name) + '" loading="lazy" />' +
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

    var id = Number(button.getAttribute("data-id"));
    var product = catalog.filter(function (p) { return p.id === id; })[0];
    if (!product) { return; }

    addToCartGuarded(product, 1, button);
  }

  /* ---------- Header account menu ---------- */

  /** Pages the user can be sent back to after signing in. */
  function currentPageForNext() {
    var page = window.location.pathname.split("/").pop() || "index.html";
    if (page === "login.html" || page === "register.html") { return ""; }
    return page + window.location.search;
  }

  function renderAccount() {
    var slot = $("#accountSlot");
    if (!slot || !App.Auth) { return; }

    var user = App.Auth.getUser();

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

    slot.innerHTML =
      '<button type="button" class="account__btn" id="accountBtn" aria-expanded="false" aria-haspopup="true">' +
        '<span class="account__avatar" aria-hidden="true">' + esc(initial) + "</span>" +
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

    btn.addEventListener("click", function (event) {
      event.stopPropagation();
      var open = menu.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", String(open));
    });

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

        var fallback = img.getAttribute("data-fallback");
        if (!fallback) { return; }

        img.removeAttribute("data-fallback");   // only swap once
        img.src = fallback;
      },
      true
    );
  }

  /* ---------- Sticky header shadow ---------- */

  function initStickyHeader() {
    var header = $("#siteHeader");
    if (!header) { return; }

    var onScroll = function () {
      header.classList.toggle("is-stuck", window.scrollY > 8);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

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
    initAccountMenuDismissal();
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
    observeReveals: observeReveals
  };

})(window.NovaCart);
