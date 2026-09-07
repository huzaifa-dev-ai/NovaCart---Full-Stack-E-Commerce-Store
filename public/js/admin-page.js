/* =============================================================
   NovaCart — Admin dashboard (admin.html)
   -------------------------------------------------------------
   Five panels over the admin API: Overview, Products, Orders,
   Returns, Users.

   ⚠️  The page guard below is a UX convenience, not security. It
   only hides a screen in the browser. The real protection is
   server-side: every /api/admin route sits behind protect +
   requireRole("admin"), which re-checks the session cookie on the
   server. Someone editing their local cache sees an empty shell
   and gets 403 from every request.
   ============================================================= */

(function (App) {
  "use strict";

  var Auth = App.Auth;
  var ui = App.ui;
  var esc = ui.esc;

  function apiBase() {
    if (window.location.port === "5500") { return "http://localhost:5000/api"; }
    return "/api";
  }

  /* ---------- Fetch helper ---------- */

  function api(path, options) {
    var config = options || {};
    var init = {
      method: config.method || "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "include"
    };
    if (config.body) { init.body = JSON.stringify(config.body); }

    return fetch(apiBase() + path, init)
      .catch(function () { throw new Error("Can't reach the server."); })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          if (!response.ok) {
            var error = new Error(data.error || "Request failed.");
            error.status = response.status;
            error.code = data.code;
            error.errors = data.errors || [];
            throw error;
          }
          return data;
        });
      });
  }

  function fail(error) {
    ui.showToast(error && error.message ? error.message : "Something went wrong.");
  }

  /* ---------- Formatting ---------- */

  function money(value) {
    return "$" + Number(value || 0).toFixed(2);
  }

  function date(value) {
    if (!value) { return "—"; }
    return new Date(value).toLocaleDateString(undefined, {
      day: "numeric", month: "short", year: "numeric"
    });
  }

  function dateTime(value) {
    if (!value) { return "—"; }
    return new Date(value).toLocaleString(undefined, {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
    });
  }

  function pill(status) {
    return '<span class="pill pill--' + esc(status) + '">' + esc(status) + "</span>";
  }

  function row(colspan, message) {
    return '<tr><td colspan="' + colspan + '" class="admin-empty">' + esc(message) + "</td></tr>";
  }

  /** Debounce search inputs so typing doesn't fire a request per keystroke. */
  function debounce(fn, wait) {
    var timer = null;
    return function () {
      var args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(null, args); }, wait || 300);
    };
  }

  /* ---------- Drawer ---------- */

  var drawer = document.getElementById("drawer");
  var drawerTitle = document.getElementById("drawerTitle");
  var drawerBody = document.getElementById("drawerBody");
  var drawerFoot = document.getElementById("drawerFoot");
  var drawerOpener = null;

  function openDrawer(title, bodyHtml, footHtml) {
    drawerOpener = document.activeElement;
    drawerTitle.textContent = title;
    drawerBody.innerHTML = bodyHtml;
    if (footHtml) {
      drawerFoot.innerHTML = footHtml;
      drawerFoot.hidden = false;
    } else {
      drawerFoot.innerHTML = "";
      drawerFoot.hidden = true;
    }
    drawer.classList.add("is-open");
    document.body.style.overflow = "hidden";

    // Hidden inputs match a bare "input" and cannot take focus, which would
    // make this a silent no-op if one ever came first in the form.
    var focusable = drawer.querySelector(
      "input:not([type=hidden]), select, textarea, button:not([data-close])");
    if (focusable) { focusable.focus(); }
  }

  function closeDrawer() {
    drawer.classList.remove("is-open");
    document.body.style.overflow = "";
    if (drawerOpener && document.contains(drawerOpener)) { drawerOpener.focus(); }
    drawerOpener = null;
  }

  drawer.addEventListener("click", function (event) {
    if (event.target.closest("[data-close]")) { closeDrawer(); }
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && drawer.classList.contains("is-open")) { closeDrawer(); }
  });

  /* ---------- Panels ---------- */

  var loaded = {};

  function showPanel(name) {
    document.querySelectorAll(".admin-tab").forEach(function (tab) {
      tab.classList.toggle("is-active", tab.getAttribute("data-panel") === name);
    });
    document.querySelectorAll(".admin-panel").forEach(function (panel) {
      panel.hidden = panel.id !== "panel-" + name;
    });

    // Remember the section across reloads without adding a history entry.
    try { window.history.replaceState(null, "", "#" + name); } catch (err) { /* ignore */ }

    if (!loaded[name]) {
      loaded[name] = true;
      if (name === "products") { loadProducts(); }
      if (name === "orders") { loadOrders(); }
      if (name === "returns") { loadReturns(); }
      if (name === "users") { loadUsers(); }
    }
  }

  document.querySelectorAll(".admin-tab").forEach(function (tab) {
    tab.addEventListener("click", function () { showPanel(tab.getAttribute("data-panel")); });
  });

  /* ================= OVERVIEW ================= */

  function loadStats() {
    return api("/admin/stats").then(function (data) {
      var s = data.stats;

      document.getElementById("statRevenue").textContent = money(s.revenue.total);
      document.getElementById("statRevenueNote").textContent =
        s.revenue.orders + " orders · " + money(s.revenue.average) + " average";

      document.getElementById("statOrders").textContent = s.orders.total;
      document.getElementById("statOrdersNote").textContent = s.orders.pending + " awaiting processing";

      document.getElementById("statUsers").textContent = s.users.total;
      document.getElementById("statUsersNote").textContent =
        s.users.customers + " customers · " + s.users.admins + " admin";

      document.getElementById("statProducts").textContent = s.products.active;
      document.getElementById("statProductsNote").textContent =
        (s.products.total - s.products.active) + " archived";

      document.getElementById("statStock").textContent = s.products.outOfStock + s.products.lowStock;
      document.getElementById("statStockNote").textContent =
        s.products.outOfStock + " out of stock · " + s.products.lowStock + " low";

      document.getElementById("statReturns").textContent = s.returns.open;
      document.getElementById("statReturnsNote").textContent = s.returns.total + " in total";

      document.getElementById("countProducts").textContent = s.products.active;
      document.getElementById("countOrders").textContent = s.orders.total;
      document.getElementById("countReturns").textContent = s.returns.open;
      document.getElementById("countUsers").textContent = s.users.total;

      var body = document.getElementById("recentOrders");
      if (!data.recentOrders.length) {
        body.innerHTML = row(4, "No orders yet.");
        return;
      }
      body.innerHTML = data.recentOrders.map(function (order) {
        return "<tr>" +
          '<td class="admin-table__strong">' + esc(order.number) + "</td>" +
          "<td>" + esc(order.customer.name) + '<div class="admin-table__muted">' + esc(order.customer.email) + "</div></td>" +
          "<td>" + pill(order.status) + "</td>" +
          '<td class="admin-table__right admin-table__strong">' + money(order.total) + "</td>" +
        "</tr>";
      }).join("");
    }).catch(fail);
  }

  document.getElementById("refreshStats").addEventListener("click", function () {
    loadStats().then(function () { ui.showToast("Dashboard refreshed"); });
  });

  /* ================= PRODUCTS ================= */

  var productCache = [];

  function loadProducts() {
    var search = document.getElementById("productSearch").value.trim();
    var category = document.getElementById("productCategory").value;
    var stock = document.getElementById("productStock").value;

    var query = "/products?limit=100";
    if (search) { query += "&search=" + encodeURIComponent(search); }
    if (category) { query += "&category=" + encodeURIComponent(category); }

    return api(query).then(function (data) {
      var items = data.products || [];

      // Stock filter is a view concern, so it stays on the client.
      if (stock === "out") { items = items.filter(function (p) { return p.stock === 0; }); }
      if (stock === "low") { items = items.filter(function (p) { return p.stock > 0 && p.stock <= 5; }); }

      productCache = items;
      var body = document.getElementById("productRows");

      if (!items.length) {
        body.innerHTML = row(6, "No products match those filters.");
        return;
      }

      body.innerHTML = items.map(function (p) {
        var stockPill = p.stock === 0
          ? '<span class="pill pill--out">out</span>'
          : (p.stock <= 5 ? '<span class="pill pill--warn">low</span>' : '<span class="pill pill--ok">ok</span>');

        return '<tr data-id="' + p.id + '">' +
          '<td><div class="admin-cell">' +
            '<img class="admin-thumb" src="' + esc(p.image) + '" alt="" loading="lazy" />' +
            '<div class="admin-cell__text">' +
              '<div class="admin-table__strong">' + esc(p.name) + "</div>" +
              '<div class="admin-table__muted">#' + p.id + (p.badge ? " · " + esc(p.badge) : "") + (p.featured ? " · featured" : "") + "</div>" +
            "</div>" +
          "</div></td>" +
          "<td>" + esc(p.category) + "</td>" +
          '<td class="admin-table__right admin-table__strong">' + money(p.price) + "</td>" +
          '<td class="admin-table__right">' + p.stock + "</td>" +
          "<td>" + stockPill + "</td>" +
          '<td><div class="admin-actions">' +
            '<button type="button" class="icon-btn js-edit-product" aria-label="Edit ' + esc(p.name) + '">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>' +
            "</button>" +
            '<button type="button" class="icon-btn icon-btn--danger js-archive-product" aria-label="Archive ' + esc(p.name) + '">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>' +
            "</button>" +
          "</div></td>" +
        "</tr>";
      }).join("");
    }).catch(function (error) {
      document.getElementById("productRows").innerHTML = row(6, error.message);
    });
  }

  /**
   * Stock, per colour where a product has them.
   *
   * A product with three colours has three stock levels, and the shop sells
   * from those rather than from any single figure — so typing one number and
   * having it split three ways is guesswork the shopkeeper should not have to
   * do. Where colours exist they get a box each and the total is shown but not
   * typed: it is the sum, and letting someone type a total that disagrees with
   * its own parts is how the two drift apart.
   *
   * A product with one colour, or none, keeps the plain single field.
   */
  function stockFields(product) {
    var colors = product.colors || [];
    if (colors.length < 2) {
      return field("Stock", "pStock", product.stock, "number", true);
    }

    var total = colors.reduce(function (sum, c) { return sum + (Number(c.stockCount) || 0); }, 0);

    var rows = colors.map(function (c) {
      var isDefault = c.id === product.defaultColorId;
      return '<div class="vstock__row" data-existing-color="' + esc(c.id) + '">' +
        // Which colour the product opens on, and whose photograph the card
        // carries. One choice across the whole group, so a radio.
        '<input class="vstock__default" type="radio" name="defaultColour"' +
          ' id="vdefault-' + esc(c.id) + '" data-color-id="' + esc(c.id) + '"' +
          ' aria-label="Open on ' + esc(c.label) + '"' +
          ' title="Show this colour first"' + (isDefault ? " checked" : "") + " />" +
        // A picker rather than a dot: a colour saved with the wrong swatch
        // could otherwise never be put right from here.
        '<input class="vstock__swatch" type="color"' +
          ' id="vswatch-' + esc(c.id) + '" data-color-id="' + esc(c.id) + '"' +
          ' aria-label="Swatch colour for ' + esc(c.label) + '"' +
          ' value="' + esc(hexOrDefault(c.swatchHex)) + '" />' +
        '<input class="vstock__name" type="text" maxlength="40" spellcheck="false"' +
          ' id="vlabel-' + esc(c.id) + '" data-color-id="' + esc(c.id) + '"' +
          ' aria-label="Name of this colour"' +
          ' value="' + esc(c.label) + '" />' +
        // The path is kept but no longer shown: pictures are chosen from
        // the device now, so nobody need know where the files are filed.
        '<input class="vstock__image" type="hidden"' +
          ' id="vimage-' + esc(c.id) + '" data-color-id="' + esc(c.id) + '"' +
          ' data-picker-for="' + esc(c.label) + '"' +
          ' value="' + esc(c.image || "") + '" />' +
        '<input class="vstock__input" type="number" min="0" step="1" inputmode="numeric"' +
          ' id="vstock-' + esc(c.id) + '" data-color-id="' + esc(c.id) + '"' +
          ' aria-label="Stock for ' + esc(c.label) + '"' +
          ' value="' + (Number(c.stockCount) || 0) + '" />' +
        '<button type="button" class="vstock__remove" data-color-id="' + esc(c.id) + '"' +
          ' aria-label="Remove ' + esc(c.label) + '" title="Remove this colour">&times;</button>' +
      "</div>";
    }).join("");

    return '<div class="field field--wide">' +
      '<label>Colours — photo and stock</label>' +
      '<div class="vstock">' + rows +
        '<p class="vstock__total">Total in stock: <strong id="pStockTotal">' + total + "</strong>" +
          '<span class="vstock__hint">The card in the catalogue follows the default colour.</span></p>' +
      "</div>" +
      '<span class="field-error"></span></div>';
  }

  /**
   * Taking a colour off, reversibly. The row stays on screen struck through
   * until the save, so a mis-click costs one more click rather than a colour;
   * and a row on its way out must not also be the one the product opens on.
   */
  function wireColorRemoval() {
    var host = document.querySelector(".vstock");
    if (!host) { return; }

    host.addEventListener("click", function (event) {
      var button = event.target.closest(".vstock__remove");
      if (!button) { return; }
      var row = button.closest(".vstock__row");
      var going = row.classList.toggle("is-removing");

      // Nothing in a row that is leaving should still be editable, and a
      // struck-through row must not hold the default.
      [].slice.call(row.querySelectorAll("input")).forEach(function (el) {
        el.disabled = going;
      });
      button.setAttribute("aria-label",
        (going ? "Keep " : "Remove ") + row.querySelector(".vstock__name").value);
      button.innerHTML = going ? "&#8624;" : "&times;";

      if (going && row.querySelector(".vstock__default").checked) {
        var stays = [].slice.call(document.querySelectorAll(".vstock__row"))
          .filter(function (r) { return !r.classList.contains("is-removing"); })[0];
        if (stays) { stays.querySelector(".vstock__default").checked = true; }
      }
      recountStock();
    });
  }

  /** The total under the rows, counting only the colours that will survive. */
  function recountStock() {
    var out = document.getElementById("pStockTotal");
    if (!out) { return; }
    out.textContent = [].slice.call(document.querySelectorAll(".vstock__row"))
      .filter(function (row) { return !row.classList.contains("is-removing"); })
      .reduce(function (sum, row) {
        var n = parseInt(row.querySelector(".vstock__input").value, 10);
        return sum + (isNaN(n) || n < 0 ? 0 : n);
      }, 0);
  }

  /** Keep the displayed total honest as the individual boxes are typed in. */
  function wireStockTotal() {
    [].slice.call(document.querySelectorAll(".vstock__input"))
      .forEach(function (el) { el.addEventListener("input", recountStock); });
  }
  /**
   * The colour editor, offered when creating a product.
   *
   * A colour needs four things: a name, a swatch, its own photograph and its
   * own stock. Leave the whole section empty and you get a plain
   * single-image product, which is what most of the catalogue is.
   *
   * The product's own image is NOT asked for separately here — the card and
   * the default swatch have to show the same photograph, so it is taken from
   * the first colour rather than typed twice and left to drift.
   */
  /**
   * The same editor serves both drawers, in two modes. On a new product it IS
   * the product's colours. On one that already exists it only ADDS: what is
   * already on file is shown above and never passes through here, which is
   * what keeps a colour's name and photograph out of this form's reach.
   */
  function colorEditor(existing) {
    var adding = !!existing;
    var colours = (existing && existing.colors) || [];
    var note = adding
      ? "(optional — what is already there is left as it is)"
      : "(optional — leave empty for a single-image product)";
    return '<div class="field field--wide">' +
      "<label>" + (adding ? "Add a colour" : "Colours") +
        ' <span style="color:#94A3B8">' + note + "</span></label>" +
      '<div class="cedit" id="colorRows" data-color-mode="' + (adding ? "add" : "new") + '"' +
        // A product with no colours until now already carries a number in
        // stock. Offer it to the first colour added, so that count is carried
        // across rather than quietly dropped.
        (adding && !colours.length
          ? ' data-seed-stock="' + (Number(existing.stock) || 0) + '"' : "") +
      "></div>" +
      '<button type="button" class="btn btn--outline btn--sm" id="addColorRow">+ Add a colour</button>' +
      '<span class="field-error"></span></div>';
  }

  /** One editable colour: name, swatch, photo and its own stock. */
  function colorRowHtml(n) {
    return '<div class="cedit__row" data-color-row>' +
      '<input type="color" class="cedit__hex" value="#1E293B" aria-label="Swatch colour" />' +
      '<input type="text" class="cedit__label" placeholder="Colour name, e.g. Onyx Black"' +
        ' aria-label="Colour name" />' +
      '<input type="hidden" class="cedit__image" data-picker-for="this colour" />' +
      '<input type="number" class="cedit__stock" min="0" step="1" value="0"' +
        ' aria-label="Stock for this colour" />' +
      '<button type="button" class="cedit__remove" aria-label="Remove this colour">&times;</button>' +
    "</div>";
  }

  /**
   * Follow the name with the swatch, until the shopkeeper picks one. Touching
   * the picker is taken to mean "I want this one", and the row stops guessing
   * from then on - a deliberate choice is never written over.
   */
  function wireSwatchFromName(row) {
    var name = row.querySelector(".cedit__label");
    var hex = row.querySelector(".cedit__hex");
    if (!name || !hex) { return; }

    hex.addEventListener("input", function () { row.dataset.hexChosen = "1"; });
    hex.addEventListener("change", function () { row.dataset.hexChosen = "1"; });

    name.addEventListener("input", function () {
      if (row.dataset.hexChosen) { return; }
      var suggested = swatchForName(name.value);
      if (suggested) { hex.value = suggested; }
    });
  }

  /** Add/remove wiring for the colour rows. */
  function wireColorEditor() {
    var rows = document.getElementById("colorRows");
    var add = document.getElementById("addColorRow");
    if (!rows || !add) { return; }

    add.addEventListener("click", function () {
      rows.insertAdjacentHTML("beforeend", colorRowHtml());
      var last = rows.lastElementChild;
      // Only the first colour on a product that had none inherits its count,
      // and only once - the rest start at zero, as an empty row should.
      var seed = rows.getAttribute("data-seed-stock");
      if (seed && rows.querySelectorAll("[data-color-row]").length === 1) {
        last.querySelector(".cedit__stock").value = seed;
        rows.removeAttribute("data-seed-stock");
      }
      // A row added after the drawer opened missed the pass that gives every
      // image field its button, so give this one its own.
      attachImagePicker(last.querySelector(".cedit__image"));
      wireSwatchFromName(last);
      var name = last.querySelector(".cedit__label");
      if (name) { name.focus(); }   // land where they are about to type
    });

    rows.addEventListener("click", function (event) {
      var remove = event.target.closest(".cedit__remove");
      if (!remove) { return; }
      var row = remove.closest("[data-color-row]");
      if (row) { row.remove(); }
    });
  }

  /** Whatever colour rows are on screen, in the order they appear. */
  function readColorRows() {
    return [].slice.call(document.querySelectorAll("[data-color-row]")).map(function (row) {
      return {
        label: row.querySelector(".cedit__label").value.trim(),
        swatchHex: row.querySelector(".cedit__hex").value.trim(),
        image: row.querySelector(".cedit__image").value.trim(),
        stockCount: parseInt(row.querySelector(".cedit__stock").value, 10)
      };
    });
  }
  /* ---------- Framing a picture in the browser ---------- */

  /*  Every photograph in the shop is a 1100px square, and every card is
      served a 550px copy of it. A picture dropped in at whatever size and
      shape it happened to be therefore jumps in the grid and costs far more
      bytes than the slot it fills - a 1.9MB PNG where a framed JPEG is 200KB.

      So the framing happens here, on a canvas, before anything is uploaded.
      Doing it in the browser keeps a native image library out of the server's
      dependencies: this project installs with nothing but npm install and has
      no build step, and that is worth keeping.                              */

  /* ------------------------------------------------------------------ *
   * Reading a swatch out of a colour's name.
   *
   * A shopkeeper types "Sleek Gray" and expects a grey dot. Left alone the
   * picker keeps whatever it opened on, so two differently named colours end
   * up wearing the same swatch - which is what the shopper sees.
   * ------------------------------------------------------------------ */

  var COLOR_WORDS = {
    // neutrals
    black: "#111827", jet: "#1C1C1C", onyx: "#0B1120", obsidian: "#0F172A",
    charcoal: "#36454F", graphite: "#3F4650", slate: "#475569", gunmetal: "#2A3439",
    grey: "#808080", gray: "#808080", ash: "#B2BEB5", smoke: "#8A8F98",
    silver: "#C0C0C0", platinum: "#E5E4E2", steel: "#8C9BA5", titanium: "#A6A9AA",
    pearl: "#EAE7DC", ivory: "#FFFFF0", cream: "#FFFDD0", linen: "#FAF0E6",
    snow: "#FBFDFF", frost: "#E8F1F5", white: "#F8FAFC",
    // browns and sands
    brown: "#8B5A2B", chocolate: "#5C3A21", espresso: "#3B2C25", mocha: "#7B5E48",
    coffee: "#6F4E37", caramel: "#C88141", bronze: "#CD7F32", copper: "#B87333",
    rust: "#B7410E", clay: "#B66A50", tan: "#D2B48C", taupe: "#B2A48E",
    beige: "#F0E4D0", sand: "#E2CA9A", oat: "#DCD0BA", khaki: "#BDB183",
    stone: "#C8C2B6", nude: "#E7C9A9",
    // reds, pinks
    red: "#DC2626", crimson: "#B91C3C", scarlet: "#D62828", ruby: "#9B111E",
    cherry: "#C41E3A", wine: "#722F37", burgundy: "#6B1F2E", maroon: "#7F1D1D",
    rose: "#E11D6F", pink: "#EC4899", blush: "#E8A0A8", coral: "#FB7185",
    salmon: "#FA8072", peach: "#FFB07C", apricot: "#F3A25B",
    // oranges, yellows
    orange: "#F97316", amber: "#F59E0B", tangerine: "#F2811D", honey: "#E8A33D",
    mustard: "#D4A017", gold: "#D4AF37", brass: "#C6A664", yellow: "#EAB308",
    lemon: "#F4E04D", butter: "#F3E5AB",
    // greens
    green: "#16A34A", emerald: "#059669", jade: "#00A86B", forest: "#166534",
    pine: "#01796F", fern: "#4F7942", moss: "#6A7B53", sage: "#9CAF88",
    olive: "#6B7A2F", lime: "#84CC16", mint: "#A8E6CF",
    // blues, teals
    blue: "#2563EB", navy: "#1E3A8A", midnight: "#141E46", cobalt: "#0047AB",
    royal: "#1D4ED8", sapphire: "#0F52BA", azure: "#3A8DDE", sky: "#38BDF8",
    arctic: "#DCEBF3", ice: "#DDF0F7", denim: "#3B5B84", ocean: "#166D8C",
    teal: "#0D9488", turquoise: "#40E0D0", aqua: "#22D3EE", cyan: "#06B6D4",
    // purples
    purple: "#7E22CE", violet: "#7C3AED", indigo: "#4F46E5", plum: "#6B2D5C",
    lavender: "#C4B5FD", lilac: "#C8A2C8", mauve: "#B784A7", magenta: "#C026D3",
    fuchsia: "#D946EF",
    // times of day, used as shades
    dusk: "#4B4E6D", sunset: "#EE6C4D", sunrise: "#F6A26B", dawn: "#E7D3C4",
    storm: "#6B7280", shadow: "#374151"
  };

  /* The plain families. Product colours are nearly always "shade + family" -
     Cobalt Blue, Midnight Blue - and it is the shade that distinguishes them,
     so a shade always beats the family standing beside it. Reading the last
     word instead would paint both of those the same blue. */
  var GENERIC_WORDS = {
    black: 1, white: 1, grey: 1, gray: 1, blue: 1, green: 1, red: 1,
    yellow: 1, orange: 1, purple: 1, pink: 1, brown: 1, silver: 1,
    gold: 1, beige: 1, tan: 1
  };

  /* Pairs that mean something other than the sum of their words. */
  var COLOR_PHRASES = {
    "rose gold": "#B76E79", "off white": "#FAF9F6", "gun metal": "#2A3439",
    "space grey": "#4A4A4C", "space gray": "#4A4A4C", "jet black": "#0A0A0A",
    "matte black": "#1B1B1B", "pearl white": "#F2F0EB", "midnight black": "#0B0F1A"
  };

  /**
   * The swatch a colour's name suggests, or null when it says nothing.
   * A known phrase wins outright; otherwise the last specific shade, and only
   * failing that the plain family.
   */
  function swatchForName(label) {
    var words = String(label || "").toLowerCase().match(/[a-z]+/g) || [];
    var joined = words.join(" ");

    var phrase = null;
    Object.keys(COLOR_PHRASES).forEach(function (key) {
      if (joined.indexOf(key) !== -1) { phrase = COLOR_PHRASES[key]; }
    });
    if (phrase) { return phrase; }

    var shade = null;
    var family = null;
    words.forEach(function (word) {
      if (!Object.prototype.hasOwnProperty.call(COLOR_WORDS, word)) { return; }
      if (GENERIC_WORDS[word]) { family = COLOR_WORDS[word]; }
      else { shade = COLOR_WORDS[word]; }
    });
    return shade || family;
  }

  /** A colour input shows black for anything it cannot parse. */
  function hexOrDefault(value) {
    var hex = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#64748B";
  }

  var FRAME_SIZE = 1100;
  var THUMB_SIZE = 550;

  // A transparent 1x1, so an empty picture slot is an empty frame rather than
  // a browser's broken-image icon.
  var BLANK_PIXEL =
    "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

  /**
   * The small copy of a framed photo, matching what the catalogue asks for.
   * Returns null for anything not filed under framed/, which has no thumbnail.
   */
  function thumbPath(url) {
    if (!url || url.indexOf("/framed/") === -1 || url.indexOf("/thumb/") !== -1) { return null; }
    var cut = url.lastIndexOf("/");
    return url.slice(0, cut) + "/thumb" + url.slice(cut);
  }

  /** Draw `img` into a square of `size`, cropping the long side evenly. */
  function squareCanvas(img, size) {
    var canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext("2d");

    // A photograph scaled into a square would squash; take the biggest
    // centred square of the original instead and scale that.
    var side = Math.min(img.naturalWidth, img.naturalHeight);
    var sx = (img.naturalWidth - side) / 2;
    var sy = (img.naturalHeight - side) / 2;

    ctx.fillStyle = "#ffffff";        // JPEG has no transparency to keep
    ctx.fillRect(0, 0, size, size);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
    return canvas;
  }

  /** Read a chosen file into an <img> the canvas can draw. */
  function loadChosenImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("That file could not be read as an image."));
      };
      img.src = url;
    });
  }

  /**
   * Frame a chosen file and hand the stored path back.
   * @returns {Promise<string>} the path to put in an image field
   */
  function frameAndUpload(file) {
    return loadChosenImage(file).then(function (img) {
      var full = squareCanvas(img, FRAME_SIZE).toDataURL("image/jpeg", 0.88);
      var thumb = squareCanvas(img, THUMB_SIZE).toDataURL("image/jpeg", 0.82);
      return api("/admin/products/image", {
        method: "POST",
        body: { name: file.name, full: full, thumb: thumb }
      }).then(function (data) { return data.path; });
    });
  }

  /**
   * Give an image field its picture control: a thumbnail of what is set now,
   * and a button that frames a chosen file and files it away. The path itself
   * is held in a hidden input - it is the machine's business, not the
   * shopkeeper's.
   */
  function attachImagePicker(input) {
    if (!input || input.dataset.pickerAttached) { return; }
    input.dataset.pickerAttached = "1";

    var describes = input.getAttribute("data-picker-for") || "this product";
    // Inside a colour row there is no room for a sentence, and none is needed:
    // the thumbnail beside the button already says what the button is about.
    var compact = !!input.closest(".vstock__row, .cedit__row");

    function labelText() {
      if (!compact) { return "Choose a picture"; }
      return String(input.value || "").trim() ? "Change" : "Choose";
    }

    var thumb = document.createElement("img");
    thumb.className = "imgpick__thumb";
    thumb.alt = "";
    thumb.setAttribute("aria-hidden", "true");

    var picker = document.createElement("input");
    picker.type = "file";
    picker.accept = "image/*";
    picker.className = "visually-hidden";

    var button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn--outline btn--sm imgpick__btn";
    button.textContent = labelText();
    // The visible word is short; the spoken one stays a full phrase, and names
    // the colour, since every button on screen otherwise reads alike.
    button.setAttribute("aria-label", "Choose a picture for " + describes);

    var note = document.createElement("span");
    note.className = "imgpick__note";

    // Show whatever is set at the moment. The small copy is preferred; the
    // server hands back the full one when a thumbnail was never made.
    function showCurrent() {
      var value = String(input.value || "").trim();
      if (!value) {
        thumb.src = BLANK_PIXEL;
        thumb.removeAttribute("title");
        thumb.classList.add("imgpick__thumb--empty");
        button.textContent = labelText();
        return;
      }
      thumb.classList.remove("imgpick__thumb--empty");
      thumb.title = value.split("/").pop();
      button.textContent = labelText();
      var small = thumbPath(value);
      thumb.onerror = function () {
        thumb.onerror = null;         // one fallback, never a loop
        thumb.src = value;
      };
      thumb.src = small || value;
    }
    showCurrent();

    button.addEventListener("click", function () { picker.click(); });

    picker.addEventListener("change", function () {
      var file = picker.files && picker.files[0];
      if (!file) { return; }
      button.disabled = true;
      button.textContent = "Framing…";
      note.textContent = "";

      frameAndUpload(file).then(function (storedPath) {
        input.value = storedPath;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        showCurrent();                // the picture itself is the receipt
        if (!compact) { note.textContent = "Squared to " + FRAME_SIZE + "px."; }
      }).catch(function (error) {
        note.textContent = error.message || "That picture could not be used.";
      }).then(function () {
        button.disabled = false;
        button.textContent = labelText();
        picker.value = "";            // so the same file can be picked again
      });
    });

    var row = document.createElement("div");
    row.className = "imgpick";
    row.appendChild(thumb);
    row.appendChild(button);
    row.appendChild(note);
    row.appendChild(picker);
    input.parentNode.insertBefore(row, input.nextSibling);
  }

  /** Every image field in the drawer: the product's own, and each colour's. */
  function wireImagePickers() {
    attachImagePicker(document.getElementById("pImage"));
    [].slice.call(document.querySelectorAll(".vstock__image, .cedit__image"))
      .forEach(attachImagePicker);
  }
  function productForm(p) {
    var product = p || {};
    return '<form id="productForm" novalidate><div class="form-grid">' +
      field("Name", "pName", product.name, "text", true) +
      field("Category", "pCategory", product.category, "text", true) +
      field("Price", "pPrice", product.price, "number", true) +
      field("Old price", "pOldPrice", product.oldPrice, "number") +
      stockFields(product) +
      selectField("Badge", "pBadge", product.badge, [["", "None"], ["Sale", "Sale"], ["New", "New"]]) +
      imageField("Product picture", "pImage", product.image) +
      // Offered either way: as a new product's colours, or as more colours for
      // one that already has some. Renaming or re-photographing a colour that
      // is already on file is a bigger job, and is not offered here.
      colorEditor(p) +
      field("Short description", "pShort", product.shortDescription, "text", true, true) +
      textField("Full description", "pDescription", product.description, true) +
      textField("Features (one per line)", "pFeatures", (product.features || []).join("\n"), true) +
      '<div class="field field--wide"><label class="check">' +
        '<input type="checkbox" id="pFeatured"' + (product.featured ? " checked" : "") + " />" +
        "<span>Show in Featured Products on the home page</span></label></div>" +
    "</div></form>";
  }

  function field(label, id, value, type, required, wide) {
    return '<div class="field' + (wide ? " field--wide" : "") + '">' +
      '<label for="' + id + '">' + esc(label) + (required ? "" : " <span style=\"color:#94A3B8\">(optional)</span>") + "</label>" +
      '<input type="' + type + '" id="' + id + '"' + (type === "number" ? ' step="0.01"' : "") +
        ' value="' + (value === null || value === undefined ? "" : esc(String(value))) + '" />' +
      '<span class="field-error"></span></div>';
  }

  /**
   * The product's own picture. Like the colour rows, the path is held but not
   * shown - the picture control beside it is how one is chosen. Left empty for
   * a new product so the server asks for a real choice rather than accepting
   * a half-typed stub.
   */
  function imageField(label, id, value) {
    return '<div class="field field--wide">' +
      "<label>" + esc(label) + "</label>" +
      '<input type="hidden" id="' + id + '" data-picker-for="this product"' +
        ' value="' + esc(value || "") + '" />' +
      '<span class="field-error"></span></div>';
  }

  function textField(label, id, value, wide) {
    return '<div class="field' + (wide ? " field--wide" : "") + '">' +
      '<label for="' + id + '">' + esc(label) + "</label>" +
      '<textarea id="' + id + '" style="min-height:96px;">' + esc(value || "") + "</textarea>" +
      '<span class="field-error"></span></div>';
  }

  function selectField(label, id, value, options) {
    return '<div class="field"><label for="' + id + '">' + esc(label) + "</label>" +
      '<select id="' + id + '">' + options.map(function (opt) {
        return '<option value="' + esc(opt[0]) + '"' + (String(value || "") === opt[0] ? " selected" : "") + ">" + esc(opt[1]) + "</option>";
      }).join("") + "</select></div>";
  }

  /** Whichever shape of stock control the form is currently showing. */
  function readStock() {
    var rows = [].slice.call(document.querySelectorAll(".vstock__row"));
    if (!rows.length) {
      return { stock: parseInt(document.getElementById("pStock").value, 10) };
    }

    var leaving = rows.filter(function (r) { return r.classList.contains("is-removing"); });
    var staying = rows.filter(function (r) { return !r.classList.contains("is-removing"); });
    var idOf = function (row) { return row.getAttribute("data-existing-color"); };

    // Only the survivors are described. Sending a count or a name for a colour
    // in the same breath as removing it is a contradiction the server would
    // have to guess its way out of.
    var variantStock = {};
    var variantImages = {};
    var variantSwatches = {};
    var variantLabels = {};

    staying.forEach(function (row) {
      var id = idOf(row);
      variantStock[id] = parseInt(row.querySelector(".vstock__input").value, 10);
      variantSwatches[id] = row.querySelector(".vstock__swatch").value;
      variantLabels[id] = row.querySelector(".vstock__name").value.trim();

      // A colour with nothing on file is left OUT rather than sent as empty:
      // the server reads an empty path as a mistake, not as "leave this one
      // alone", so sending it would refuse the whole save over a colour the
      // shopkeeper never touched.
      var chosen = row.querySelector(".vstock__image").value.trim();
      if (chosen) { variantImages[id] = chosen; }
    });

    var payload = {
      variantStock: variantStock, variantImages: variantImages,
      variantSwatches: variantSwatches, variantLabels: variantLabels
    };

    if (leaving.length) { payload.removeColors = leaving.map(idOf); }

    var chosenDefault = document.querySelector(".vstock__default:checked");
    if (chosenDefault) { payload.defaultColorId = chosenDefault.getAttribute("data-color-id"); }

    return payload;
  }

  function readProductForm() {
    var features = document.getElementById("pFeatures").value
      .split("\n").map(function (s) { return s.trim(); }).filter(Boolean);

    var oldPrice = document.getElementById("pOldPrice").value.trim();

    var payload = {
      name: document.getElementById("pName").value.trim(),
      category: document.getElementById("pCategory").value.trim(),
      price: Number(document.getElementById("pPrice").value),
      oldPrice: oldPrice === "" ? null : Number(oldPrice),
      badge: document.getElementById("pBadge").value || null,
      image: document.getElementById("pImage").value.trim(),
      shortDescription: document.getElementById("pShort").value.trim(),
      description: document.getElementById("pDescription").value.trim(),
      features: features,
      featured: document.getElementById("pFeatured").checked
    };

    // Stock is attached afterwards because its SHAPE depends on the product:
    // per-colour boxes when it has colours, a single figure when it does not.
    // The server treats variantStock as the more specific of the two.
    var stock = readStock();
    for (var key in stock) {
      if (Object.prototype.hasOwnProperty.call(stock, key)) { payload[key] = stock[key]; }
    }

    // Colours, when the create form is showing them. The first one supplies
    // the product image and the counts supply the total, so neither is typed
    // twice and the card can never disagree with the default swatch.
    var colors = readColorRows();
    if (colors.length) {
      var editor = document.getElementById("colorRows");
      if (editor && editor.getAttribute("data-color-mode") === "add") {
        // Adding to a product that already exists: the colours on file keep
        // their own counts and pictures, and the server works out the new
        // total - so neither the stock nor the card image is set from here.
        payload.addColors = colors;
      } else {
        payload.colors = colors;
        if (colors[0].image) { payload.image = colors[0].image; }
        payload.stock = colors.reduce(function (sum, c) {
          return sum + (isNaN(c.stockCount) ? 0 : c.stockCount);
        }, 0);
      }
    }
    return payload;
  }

  /**
   * A complaint about one colour, e.g. "variantImages.onyx-black" when
   * editing or "colors.2" when creating, pointed back at the row it is about.
   */
  function colourFieldFor(field) {
    var editing = /^variantImages\.(.+)$/.exec(field);
    if (editing) { return document.getElementById("vimage-" + editing[1]); }
    var swatch = /^variantSwatches\.(.+)$/.exec(field);
    if (swatch) { return document.getElementById("vswatch-" + swatch[1]); }
    var creating = /^(?:colors|addColors)\.(\d+)$/.exec(field);
    if (creating) {
      var row = document.querySelectorAll("[data-color-row]")[Number(creating[1])];
      return row ? row.querySelector(".cedit__image") : null;
    }
    return null;
  }

  function clearFormErrors() {
    [].slice.call(document.querySelectorAll("#productForm .is-invalid"))
      .forEach(function (el) { el.classList.remove("is-invalid"); });
    [].slice.call(document.querySelectorAll("#productForm .field-error"))
      .forEach(function (el) { el.textContent = ""; });
  }

  function paintFormErrors(error) {
    var map = {
      name: "pName", category: "pCategory", price: "pPrice", oldPrice: "pOldPrice",
      stock: "pStock", image: "pImage", shortDescription: "pShort",
      description: "pDescription", badge: "pBadge"
    };
    var unplaced = [];

    (error.errors || []).forEach(function (item) {
      var el = document.getElementById(map[item.field]) || colourFieldFor(item.field);
      var wrap = el ? el.closest(".field") : null;
      if (!wrap) { unplaced.push(item.message); return; }
      wrap.classList.add("is-invalid");
      // Mark the colour's own row too, so the eye lands on the right one
      // among several.
      var row = el.closest(".vstock__row, .cedit__row");
      if (row) { row.classList.add("is-invalid"); }
      var hint = wrap.querySelector(".field-error");
      if (hint) { hint.textContent = item.message; }
    });

    // Nothing may fail in silence. Anything that could not be pinned to a
    // field on screen is still said out loud, or the save looks like it worked.
    if (unplaced.length) { ui.showToast(unplaced[0]); }
    else if (!(error.errors || []).length) { ui.showToast(error.message); }
  }

  function editProduct(product) {
    var isNew = !product;
    openDrawer(
      isNew ? "New product" : "Edit " + product.name,
      productForm(product),
      '<button type="button" class="btn btn--outline" data-close="1">Cancel</button>' +
      '<button type="button" class="btn btn--accent" id="saveProduct">' + (isNew ? "Create" : "Save changes") + "</button>"
    );

    wireStockTotal();
    wireColorRemoval();
    wireColorEditor();
    wireImagePickers();

    document.getElementById("saveProduct").addEventListener("click", function () {
      var button = this;
      button.disabled = true;
      button.textContent = "Saving…";
      clearFormErrors();            // last attempt's marks are not this one's

      var payload = readProductForm();
      var request = isNew
        ? api("/admin/products", { method: "POST", body: payload })
        : api("/admin/products/" + product.id, { method: "PATCH", body: payload });

      request.then(function () {
        closeDrawer();
        ui.showToast(isNew ? "Product created" : "Product updated");
        loadProducts();
        loadStats();
      }).catch(function (error) {
        paintFormErrors(error);
        button.disabled = false;
        button.textContent = isNew ? "Create" : "Save changes";
      });
    });
  }

  document.getElementById("newProduct").addEventListener("click", function () { editProduct(null); });

  document.getElementById("productRows").addEventListener("click", function (event) {
    var tr = event.target.closest("tr[data-id]");
    if (!tr) { return; }
    var id = Number(tr.getAttribute("data-id"));
    var product = productCache.filter(function (p) { return p.id === id; })[0];
    if (!product) { return; }

    if (event.target.closest(".js-edit-product")) {
      editProduct(product);
    } else if (event.target.closest(".js-archive-product")) {
      if (!window.confirm("Archive \"" + product.name + "\"? It will stop appearing in the store.")) { return; }
      api("/admin/products/" + id, { method: "DELETE" }).then(function (data) {
        ui.showToast(data.message || "Product archived");
        loadProducts();
        loadStats();
      }).catch(fail);
    }
  });

  ["productSearch", "productCategory", "productStock"].forEach(function (id) {
    var el = document.getElementById(id);
    var handler = id === "productSearch" ? debounce(loadProducts, 320) : loadProducts;
    el.addEventListener(id === "productSearch" ? "input" : "change", handler);
  });

  /* ================= ORDERS ================= */

  var PM_LABELS = { cod: "COD", card: "Card" };
  var PS_COLORS = {
    unpaid:   { bg: "#F1F5F9", fg: "#475569" },
    pending:  { bg: "#FEF3C7", fg: "#D97706" },
    paid:     { bg: "#ECFDF5", fg: "#059669" },
    failed:   { bg: "#FEF2F2", fg: "#DC2626" },
    refunded: { bg: "#EDE9FE", fg: "#7C3AED" }
  };
  function payBadge(method, status) {
    var label = (PM_LABELS[method] || "COD") + " · " + (status || "unpaid");
    var c = PS_COLORS[status] || PS_COLORS.unpaid;
    return '<span style="display:inline-block;padding:3px 9px;border-radius:20px;font-size:.75rem;font-weight:700;background:' + c.bg + ';color:' + c.fg + ';">' + esc(label) + '</span>';
  }

  var orderCache = [];

  function loadOrders() {
    var search = document.getElementById("orderSearch").value.trim();
    var status = document.getElementById("orderStatus").value;

    var query = "/orders?limit=50";
    if (search) { query += "&search=" + encodeURIComponent(search); }
    if (status) { query += "&status=" + encodeURIComponent(status); }

    return api(query).then(function (data) {
      orderCache = data.orders || [];
      var body = document.getElementById("orderRows");

      if (!orderCache.length) {
        body.innerHTML = row(7, "No orders match those filters.");
        return;
      }

      body.innerHTML = orderCache.map(function (o) {
        var units = (o.items || []).reduce(function (s, l) { return s + l.qty; }, 0);
        return '<tr data-id="' + esc(o.id) + '" style="cursor:pointer;">' +
          '<td class="admin-table__strong">' + esc(o.number) + "</td>" +
          "<td>" + esc(o.customer.name) + '<div class="admin-table__muted">' + esc(o.customer.email) + "</div></td>" +
          "<td>" + date(o.placedAt) + "</td>" +
          "<td>" + units + "</td>" +
          "<td>" + pill(o.status) + "</td>" +
          "<td>" + payBadge(o.paymentMethod, o.paymentStatus) + "</td>" +
          '<td class="admin-table__right admin-table__strong">' + money(o.total) + "</td>" +
        "</tr>";
      }).join("");
    }).catch(function (error) {
      document.getElementById("orderRows").innerHTML = row(6, error.message);
    });
  }

  var NEXT_STATUS = {
    pending: ["processing", "cancelled"],
    processing: ["shipped", "cancelled"],
    shipped: ["delivered"],
    delivered: [],
    cancelled: []
  };

  function orderDrawer(order) {
    var items = (order.items || []).map(function (l) {
      return '<div class="admin-cell" style="margin-bottom:12px;">' +
        '<img class="admin-thumb" src="' + esc(l.image) + '" alt="" />' +
        '<div class="admin-cell__text" style="flex:1;">' +
          '<div class="admin-table__strong">' + esc(l.name) + "</div>" +
          '<div class="admin-table__muted">' + l.qty + " × " + money(l.unitPrice) + "</div>" +
        "</div>" +
        '<div class="admin-table__strong">' + money(l.unitPrice * l.qty) + "</div>" +
      "</div>";
    }).join("");

    var timeline = (order.timeline || []).map(function (t) {
      return '<div class="timeline__item"><span class="timeline__dot"></span><div>' +
        "<div>" + pill(t.status) + (t.note ? " " + esc(t.note) : "") + "</div>" +
        '<div class="timeline__when">' + dateTime(t.at) + " · " + esc(t.by) + "</div>" +
      "</div></div>";
    }).join("");

    var options = NEXT_STATUS[order.status] || [];

    var body =
      '<dl class="detail-rows">' +
        '<div class="detail-row"><dt>Status</dt><dd>' + pill(order.status) + "</dd></div>" +
        '<div class="detail-row"><dt>Payment</dt><dd>' + payBadge(order.paymentMethod, order.paymentStatus) +
          (order.paymentRef ? '<div style="margin-top:4px;font-size:.84rem;color:var(--slate-700);"><strong>Trx ID:</strong> <code style="background:#F1F5F9;padding:2px 6px;border-radius:4px;">' + esc(order.paymentRef) + '</code></div>' : '') + "</dd></div>" +
        '<div class="detail-row"><dt>Placed</dt><dd>' + dateTime(order.placedAt) + "</dd></div>" +
        '<div class="detail-row"><dt>Customer</dt><dd>' + esc(order.customer.name) + "</dd></div>" +
        '<div class="detail-row"><dt>Email</dt><dd>' + esc(order.customer.email) + "</dd></div>" +
        '<div class="detail-row"><dt>Phone</dt><dd>' + esc(order.customer.phone) + "</dd></div>" +
        '<div class="detail-row"><dt>Deliver to</dt><dd>' + esc(order.customer.address) + "<br/>" +
          esc(order.customer.city) + " " + esc(order.customer.postal) + "</dd></div>" +
      "</dl>" +
      "<h4 style=\"font-size:.95rem;margin-bottom:12px;\">Items</h4>" + items +
      '<dl class="detail-rows" style="margin-top:18px;">' +
        '<div class="detail-row"><dt>Subtotal</dt><dd>' + money(order.subtotal) + "</dd></div>" +
        '<div class="detail-row"><dt>Shipping</dt><dd>' + (order.shipping === 0 ? "Free" : money(order.shipping)) + "</dd></div>" +
        '<div class="detail-row"><dt>Total</dt><dd style="font-size:1.15rem;">' + money(order.total) + "</dd></div>" +
      "</dl>" +
      "<h4 style=\"font-size:.95rem;margin:22px 0 12px;\">History</h4>" +
      '<div class="timeline">' + timeline + "</div>" +
      (options.length
        ? '<div class="field" style="margin-top:22px;"><label for="statusNote">Note (optional)</label>' +
          '<input type="text" id="statusNote" placeholder="Tracking number, reason…" /></div>'
        : '<p class="admin-table__muted" style="margin-top:22px;">This order is ' + esc(order.status) + " and cannot be changed further.</p>");

    var foot = options.length
      ? options.map(function (next) {
          var kind = next === "cancelled" ? "btn--outline" : "btn--accent";
          return '<button type="button" class="btn ' + kind + ' js-set-status" data-status="' + next + '">' +
            (next === "cancelled" ? "Cancel order" : "Mark " + next) + "</button>";
        }).join("")
      : null;

    openDrawer("Order " + order.number, body, foot);

    drawerFoot.querySelectorAll(".js-set-status").forEach(function (button) {
      button.addEventListener("click", function () {
        var status = button.getAttribute("data-status");
        var note = document.getElementById("statusNote");

        if (status === "cancelled" &&
            !window.confirm("Cancel order " + order.number + "? Stock will be returned to the shelf.")) {
          return;
        }

        drawerFoot.querySelectorAll("button").forEach(function (b) { b.disabled = true; });

        api("/orders/" + order.id, {
          method: "PATCH",
          body: { status: status, note: note ? note.value.trim() : "" }
        }).then(function () {
          closeDrawer();
          ui.showToast("Order " + order.number + " → " + status);
          loadOrders();
          loadStats();
        }).catch(function (error) {
          fail(error);
          drawerFoot.querySelectorAll("button").forEach(function (b) { b.disabled = false; });
        });
      });
    });
  }

  document.getElementById("orderRows").addEventListener("click", function (event) {
    var tr = event.target.closest("tr[data-id]");
    if (!tr) { return; }
    var order = orderCache.filter(function (o) { return o.id === tr.getAttribute("data-id"); })[0];
    if (order) { orderDrawer(order); }
  });

  document.getElementById("orderSearch").addEventListener("input", debounce(loadOrders, 320));
  document.getElementById("orderStatus").addEventListener("change", loadOrders);

  /* ================= RETURNS ================= */

  var returnCache = [];

  function loadReturns() {
    var search = document.getElementById("returnSearch").value.trim();
    var status = document.getElementById("returnStatus").value;

    var query = "/returns?limit=50";
    if (search) { query += "&search=" + encodeURIComponent(search); }
    if (status) { query += "&status=" + encodeURIComponent(status); }

    return api(query).then(function (data) {
      returnCache = data.returns || [];
      var body = document.getElementById("returnRows");

      if (!returnCache.length) {
        body.innerHTML = row(6, "No return requests match those filters.");
        return;
      }

      body.innerHTML = returnCache.map(function (r) {
        var value = (r.items || []).reduce(function (s, l) { return s + l.unitPrice * l.qty; }, 0);
        return '<tr data-id="' + esc(r.id) + '" style="cursor:pointer;">' +
          '<td class="admin-table__strong">' + esc(r.reference) + "</td>" +
          "<td>" + esc(r.orderNumber) + "</td>" +
          "<td>" + esc(r.customerEmail) + "</td>" +
          "<td>" + date(r.createdAt) + "</td>" +
          "<td>" + pill(r.status) + "</td>" +
          '<td class="admin-table__right admin-table__strong">' + money(value) + "</td>" +
        "</tr>";
      }).join("");
    }).catch(function (error) {
      document.getElementById("returnRows").innerHTML = row(6, error.message);
    });
  }

  function returnDrawer(request) {
    var value = (request.items || []).reduce(function (s, l) { return s + l.unitPrice * l.qty; }, 0);
    var items = (request.items || []).map(function (l) {
      return '<div class="detail-row"><dt>' + esc(l.name) + " × " + l.qty + "</dt><dd>" +
        money(l.unitPrice * l.qty) + "</dd></div>";
    }).join("");

    var open = request.status === "requested" || request.status === "approved";

    var body =
      '<dl class="detail-rows">' +
        '<div class="detail-row"><dt>Status</dt><dd>' + pill(request.status) + "</dd></div>" +
        '<div class="detail-row"><dt>Order</dt><dd>' + esc(request.orderNumber) + "</dd></div>" +
        '<div class="detail-row"><dt>Customer</dt><dd>' + esc(request.customerEmail) + "</dd></div>" +
        '<div class="detail-row"><dt>Requested</dt><dd>' + dateTime(request.createdAt) + "</dd></div>" +
      "</dl>" +
      "<h4 style=\"font-size:.95rem;margin-bottom:10px;\">Items</h4>" +
      '<dl class="detail-rows">' + items +
        '<div class="detail-row"><dt>Value</dt><dd style="font-size:1.1rem;">' + money(value) + "</dd></div>" +
      "</dl>" +
      "<h4 style=\"font-size:.95rem;margin:20px 0 8px;\">Reason given</h4>" +
      '<p style="padding:14px;background:var(--slate-50);border-left:3px solid var(--indigo-600);border-radius:6px;font-size:.9rem;line-height:1.65;color:var(--text-body);">' +
        esc(request.reason) + "</p>" +
      (request.adminNote
        ? "<h4 style=\"font-size:.95rem;margin:20px 0 8px;\">Your note</h4><p class=\"admin-table__muted\">" + esc(request.adminNote) + "</p>"
        : "") +
      (open
        ? '<div class="field" style="margin-top:20px;"><label for="returnNote">Note to the customer</label>' +
          '<textarea id="returnNote" style="min-height:80px;" placeholder="Explain the decision…"></textarea></div>' +
          (request.status === "approved"
            ? '<div class="field"><label for="refundAmount">Refund amount</label>' +
              '<input type="number" step="0.01" id="refundAmount" value="' + value.toFixed(2) + '" /></div>'
            : "")
        : '<p class="admin-table__muted" style="margin-top:20px;">Resolved ' + dateTime(request.resolvedAt) +
          (request.resolvedBy ? " by " + esc(request.resolvedBy) : "") + ".</p>");

    var foot = null;
    if (request.status === "requested") {
      foot = '<button type="button" class="btn btn--outline js-return-action" data-status="rejected">Reject</button>' +
             '<button type="button" class="btn btn--accent js-return-action" data-status="approved">Approve</button>';
    } else if (request.status === "approved") {
      foot = '<button type="button" class="btn btn--outline js-return-action" data-status="rejected">Reject</button>' +
             '<button type="button" class="btn btn--accent js-return-action" data-status="refunded">Mark refunded</button>';
    }

    openDrawer("Return " + request.reference, body, foot);

    drawerFoot.querySelectorAll(".js-return-action").forEach(function (button) {
      button.addEventListener("click", function () {
        var status = button.getAttribute("data-status");
        var note = document.getElementById("returnNote");
        var refund = document.getElementById("refundAmount");

        var payload = { status: status, adminNote: note ? note.value.trim() : "" };
        if (status === "refunded" && refund) { payload.refundAmount = Number(refund.value); }

        drawerFoot.querySelectorAll("button").forEach(function (b) { b.disabled = true; });

        api("/returns/" + request.id, { method: "PATCH", body: payload }).then(function () {
          closeDrawer();
          ui.showToast("Return " + request.reference + " → " + status);
          loadReturns();
          loadStats();
        }).catch(function (error) {
          fail(error);
          drawerFoot.querySelectorAll("button").forEach(function (b) { b.disabled = false; });
        });
      });
    });
  }

  document.getElementById("returnRows").addEventListener("click", function (event) {
    var tr = event.target.closest("tr[data-id]");
    if (!tr) { return; }
    var request = returnCache.filter(function (r) { return r.id === tr.getAttribute("data-id"); })[0];
    if (request) { returnDrawer(request); }
  });

  document.getElementById("returnSearch").addEventListener("input", debounce(loadReturns, 320));
  document.getElementById("returnStatus").addEventListener("change", loadReturns);

  /* ================= USERS ================= */

  var userCache = [];

  function loadUsers() {
    var search = document.getElementById("userSearch").value.trim();
    var role = document.getElementById("userRole").value;

    var query = "/admin/users?limit=100";
    if (search) { query += "&search=" + encodeURIComponent(search); }
    if (role) { query += "&role=" + encodeURIComponent(role); }

    return api(query).then(function (data) {
      userCache = data.users || [];
      var body = document.getElementById("userRows");

      if (!userCache.length) {
        body.innerHTML = row(6, "No users match those filters.");
        return;
      }

      var me = Auth.getUser();

      body.innerHTML = userCache.map(function (u) {
        var isSelf = me && u.id === me.id;
        return '<tr data-id="' + esc(u.id) + '">' +
          '<td class="admin-table__strong">' + esc(u.name) + (isSelf ? ' <span class="admin-table__muted">(you)</span>' : "") + "</td>" +
          "<td>" + esc(u.email) + "</td>" +
          '<td><span class="pill pill--' + esc(u.role) + '">' + esc(u.role) + "</span></td>" +
          "<td>" + date(u.joinedAt) + "</td>" +
          '<td class="admin-table__right">' + u.orders + '<div class="admin-table__muted">' + money(u.spent) + "</div></td>" +
          '<td><div class="admin-actions">' +
            (isSelf ? '<span class="admin-table__muted" style="font-size:.78rem;">—</span>' :
              '<button type="button" class="icon-btn js-toggle-role" aria-label="Change role for ' + esc(u.name) + '" title="' +
                (u.role === "admin" ? "Demote to customer" : "Promote to admin") + '">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 11h-6"/></svg>' +
              "</button>" +
              '<button type="button" class="icon-btn icon-btn--danger js-delete-user" aria-label="Delete ' + esc(u.name) + '">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>' +
              "</button>") +
          "</div></td>" +
        "</tr>";
      }).join("");
    }).catch(function (error) {
      document.getElementById("userRows").innerHTML = row(6, error.message);
    });
  }

  document.getElementById("userRows").addEventListener("click", function (event) {
    var tr = event.target.closest("tr[data-id]");
    if (!tr) { return; }
    var id = tr.getAttribute("data-id");
    var user = userCache.filter(function (u) { return u.id === id; })[0];
    if (!user) { return; }

    if (event.target.closest(".js-toggle-role")) {
      var role = user.role === "admin" ? "customer" : "admin";
      if (!window.confirm("Change " + user.email + " to " + role + "?")) { return; }
      api("/admin/users/" + id, { method: "PATCH", body: { role: role } }).then(function () {
        ui.showToast(user.email + " is now " + role);
        loadUsers();
        loadStats();
      }).catch(fail);
    } else if (event.target.closest(".js-delete-user")) {
      if (!window.confirm("Delete " + user.email + "? Their past orders are kept.")) { return; }
      api("/admin/users/" + id, { method: "DELETE" }).then(function (data) {
        ui.showToast(data.message || "Account removed");
        loadUsers();
        loadStats();
      }).catch(fail);
    }
  });

  document.getElementById("userSearch").addEventListener("input", debounce(loadUsers, 320));
  document.getElementById("userRole").addEventListener("change", loadUsers);

  /* ================= Init ================= */

  function denyToLogin() {
    window.location.replace("login.html?next=" + encodeURIComponent("admin.html"));
  }

  function denyToStore() {
    try {
      sessionStorage.setItem("novacart.flash", "That area is for administrators only.");
    } catch (err) { /* ignore */ }
    window.location.replace("index.html");
  }

  document.addEventListener("DOMContentLoaded", function () {
    var root = document.getElementById("adminRoot");
    if (!root) { return; }

    // Wait for the server's answer — the local cache is not trusted here.
    Auth.ready().then(function (user) {
      if (!user) { return denyToLogin(); }
      if (user.role !== "admin") { return denyToStore(); }

      document.getElementById("adminName").textContent = user.name;
      root.hidden = false;

      // Category options for the product filter come from the live catalog.
      App.getCategories().then(function (categories) {
        var select = document.getElementById("productCategory");
        categories.forEach(function (c) {
          var option = document.createElement("option");
          option.value = c.category;
          option.textContent = c.category + " (" + c.count + ")";
          select.appendChild(option);
        });
      }).catch(function () { /* filter simply stays as "All" */ });

      loadStats();

      var start = (window.location.hash || "").replace("#", "");
      showPanel(["products", "orders", "returns", "users"].indexOf(start) !== -1 ? start : "overview");
    });
  });

})(window.NovaCart);
