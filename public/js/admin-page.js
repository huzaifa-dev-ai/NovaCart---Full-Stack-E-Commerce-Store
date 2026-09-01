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

    var focusable = drawer.querySelector("input, select, textarea, button:not([data-close])");
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
      return '<div class="vstock__row">' +
        '<span class="vstock__swatch" style="background:' + esc(c.swatchHex || "#64748b") + '"' +
          ' aria-hidden="true"></span>' +
        '<label class="vstock__label" for="vstock-' + esc(c.id) + '">' + esc(c.label) + "</label>" +
        '<input class="vstock__input" type="number" min="0" step="1" inputmode="numeric"' +
          ' id="vstock-' + esc(c.id) + '" data-color-id="' + esc(c.id) + '"' +
          ' value="' + (Number(c.stockCount) || 0) + '" />' +
      "</div>";
    }).join("");

    return '<div class="field field--wide">' +
      '<label>Stock by colour</label>' +
      '<div class="vstock">' + rows +
        '<p class="vstock__total">Total in stock: <strong id="pStockTotal">' + total + "</strong></p>" +
      "</div>" +
      '<span class="field-error"></span></div>';
  }

  /** Keep the displayed total honest as the individual boxes are typed in. */
  function wireStockTotal() {
    var out = document.getElementById("pStockTotal");
    if (!out) { return; }
    var inputs = [].slice.call(document.querySelectorAll(".vstock__input"));
    var recount = function () {
      out.textContent = inputs.reduce(function (sum, el) {
        var n = parseInt(el.value, 10);
        return sum + (isNaN(n) || n < 0 ? 0 : n);
      }, 0);
    };
    inputs.forEach(function (el) { el.addEventListener("input", recount); });
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
  function colorEditor() {
    return '<div class="field field--wide">' +
      '<label>Colours <span style="color:#94A3B8">(optional — leave empty for a single-image product)</span></label>' +
      '<div class="cedit" id="colorRows"></div>' +
      '<button type="button" class="btn btn--outline btn--sm" id="addColorRow">+ Add a colour</button>' +
      '<span class="field-error"></span></div>';
  }

  /** One editable colour: name, swatch, photo and its own stock. */
  function colorRowHtml(n) {
    return '<div class="cedit__row" data-color-row>' +
      '<input type="color" class="cedit__hex" value="#1E293B" aria-label="Swatch colour" />' +
      '<input type="text" class="cedit__label" placeholder="Colour name, e.g. Onyx Black"' +
        ' aria-label="Colour name" />' +
      '<input type="text" class="cedit__image" placeholder="assets/images/products/framed/…"' +
        ' aria-label="Photo for this colour" />' +
      '<input type="number" class="cedit__stock" min="0" step="1" value="0"' +
        ' aria-label="Stock for this colour" />' +
      '<button type="button" class="cedit__remove" aria-label="Remove this colour">&times;</button>' +
    "</div>";
  }

  /** Add/remove wiring for the colour rows. */
  function wireColorEditor() {
    var rows = document.getElementById("colorRows");
    var add = document.getElementById("addColorRow");
    if (!rows || !add) { return; }

    add.addEventListener("click", function () {
      rows.insertAdjacentHTML("beforeend", colorRowHtml());
      var last = rows.lastElementChild;
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
  function productForm(p) {
    var product = p || {};
    return '<form id="productForm" novalidate><div class="form-grid">' +
      field("Name", "pName", product.name, "text", true) +
      field("Category", "pCategory", product.category, "text", true) +
      field("Price", "pPrice", product.price, "number", true) +
      field("Old price", "pOldPrice", product.oldPrice, "number") +
      stockFields(product) +
      selectField("Badge", "pBadge", product.badge, [["", "None"], ["Sale", "Sale"], ["New", "New"]]) +
      field("Image path", "pImage", product.image || "assets/images/products/", "text", true, true) +
      // Colours are offered when creating. On an existing product the drawer
      // already shows a stock box per colour; renaming or re-photographing a
      // colour is a bigger job and is not offered here yet.
      (p ? "" : colorEditor()) +
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
    var boxes = [].slice.call(document.querySelectorAll(".vstock__input"));
    if (!boxes.length) {
      return { stock: parseInt(document.getElementById("pStock").value, 10) };
    }
    var variantStock = {};
    boxes.forEach(function (el) {
      variantStock[el.getAttribute("data-color-id")] = parseInt(el.value, 10);
    });
    return { variantStock: variantStock };
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
      payload.colors = colors;
      if (colors[0].image) { payload.image = colors[0].image; }
      payload.stock = colors.reduce(function (sum, c) {
        return sum + (isNaN(c.stockCount) ? 0 : c.stockCount);
      }, 0);
    }
    return payload;
  }

  function paintFormErrors(error) {
    var map = {
      name: "pName", category: "pCategory", price: "pPrice", oldPrice: "pOldPrice",
      stock: "pStock", image: "pImage", shortDescription: "pShort",
      description: "pDescription", badge: "pBadge"
    };
    (error.errors || []).forEach(function (item) {
      var el = document.getElementById(map[item.field]);
      if (!el) { return; }
      var wrap = el.closest(".field");
      wrap.classList.add("is-invalid");
      var hint = wrap.querySelector(".field-error");
      if (hint) { hint.textContent = item.message; }
    });
    if (!(error.errors || []).length) { ui.showToast(error.message); }
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
    wireColorEditor();

    document.getElementById("saveProduct").addEventListener("click", function () {
      var button = this;
      button.disabled = true;
      button.textContent = "Saving…";

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
