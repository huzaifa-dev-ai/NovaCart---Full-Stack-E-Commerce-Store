/* =============================================================
   NovaCart — Customer orders & returns (orders.html)
   -------------------------------------------------------------
   GET  /api/orders/mine    the customer's order history
   GET  /api/orders/:number one order in full
   GET  /api/returns/mine   their return requests
   POST /api/returns        start a return

   Return eligibility (delivered, inside the 30-day window, no
   other open request) is decided by the SERVER. This page mirrors
   the rule to decide whether to show the button, but never relies
   on it — the request is validated again on arrival.
   ============================================================= */

(function (App) {
  "use strict";

  var Auth = App.Auth;
  var ui = App.ui;
  var esc = ui.esc;

  var RETURN_WINDOW_DAYS = 30;

  function apiBase() {
    if (window.location.port === "5500") { return "http://localhost:5000/api"; }
    return "/api";
  }

  function api(path, options) {
    var config = options || {};
    var init = {
      method: config.method || "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "include"
    };
    if (config.body) { init.body = JSON.stringify(config.body); }

    return fetch(apiBase() + path, init)
      .catch(function () { throw new Error("Can't reach the server. Please try again."); })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          if (!response.ok) {
            var error = new Error(data.error || "Request failed.");
            error.status = response.status;
            error.code = data.code;
            throw error;
          }
          return data;
        });
      });
  }

  /* ---------- Formatting ---------- */

  function money(value) { return "$" + Number(value || 0).toFixed(2); }

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

  /** When was this order delivered? Falls back to the placed date. */
  function deliveredAt(order) {
    var entry = (order.timeline || []).slice().reverse().filter(function (t) {
      return t.status === "delivered";
    })[0];
    return entry ? entry.at : order.placedAt;
  }

  function daysSinceDelivery(order) {
    return (Date.now() - new Date(deliveredAt(order)).getTime()) / 86400000;
  }

  /**
   * Mirrors the server's rule so the button only appears when it will work.
   * The server re-checks on submit — this is presentation, not enforcement.
   */
  function canReturn(order, openReturnOrders) {
    if (order.status !== "delivered") { return false; }
    if (openReturnOrders.indexOf(order.number) !== -1) { return false; }
    return daysSinceDelivery(order) <= RETURN_WINDOW_DAYS;
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

    var first = drawer.querySelector("textarea, input, button:not([data-close])");
    if (first) { first.focus(); }
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

  /* ---------- Tabs ---------- */

  document.querySelectorAll(".acct-tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      var name = tab.getAttribute("data-tab");
      document.querySelectorAll(".acct-tab").forEach(function (t) {
        var on = t === tab;
        t.classList.toggle("is-active", on);
        t.setAttribute("aria-selected", String(on));
      });
      document.getElementById("ordersPanel").hidden = name !== "orders";
      document.getElementById("returnsPanel").hidden = name !== "returns";
      try { window.history.replaceState(null, "", "#" + name); } catch (err) { /* ignore */ }
    });
  });

  /* ---------- Orders ---------- */

  var orders = [];
  var returns = [];

  var STEPS = ["pending", "processing", "shipped", "delivered"];

  var PM_LABELS = { cod: "COD", card: "Card" };
  var PS_COLORS = {
    unpaid:   { bg: "#F1F5F9", fg: "#475569" },
    pending:  { bg: "#FEF3C7", fg: "#D97706" },
    paid:     { bg: "#ECFDF5", fg: "#059669" },
    failed:   { bg: "#FEF2F2", fg: "#DC2626" },
    refunded: { bg: "#EDE9FE", fg: "#7C3AED" }
  };
  function payBadge(method, status) {
    var label = (PM_LABELS[method] || "COD") + " \u00b7 " + (status || "unpaid");
    var c = PS_COLORS[status] || PS_COLORS.unpaid;
    return '<span style="display:inline-block;padding:3px 9px;border-radius:20px;font-size:.75rem;font-weight:700;background:' + c.bg + ';color:' + c.fg + ';">' + esc(label) + '</span>';
  }

  function progressHtml(order) {
    if (order.status === "cancelled") {
      return '<div class="return-note">This order was cancelled' +
        (order.timeline && order.timeline.length
          ? " on " + date(order.timeline[order.timeline.length - 1].at) : "") +
        ". Any reserved stock was released.</div>";
    }
    var reached = STEPS.indexOf(order.status);
    return '<div class="order-progress">' + STEPS.map(function (step, index) {
      return '<div class="order-step' + (index <= reached ? " is-done" : "") + '">' +
        '<div class="order-step__dot"></div>' +
        '<div class="order-step__label">' + esc(step) + "</div>" +
      "</div>";
    }).join("") + "</div>";
  }

  function orderCard(order, openReturnOrders) {
    var units = (order.items || []).reduce(function (s, l) { return s + l.qty; }, 0);
    var shown = (order.items || []).slice(0, 5);
    var extra = (order.items || []).length - shown.length;

    var thumbs = shown.map(function (line) {
      return '<span class="order-thumb"><img src="' + esc(line.image) + '" alt="" loading="lazy" />' +
        '<span class="order-thumb__qty">' + line.qty + "</span></span>";
    }).join("") + (extra > 0 ? '<span class="order-thumb order-thumb--more">+' + extra + "</span>" : "");

    var actions = '<button type="button" class="btn btn--outline js-view" data-number="' + esc(order.number) + '">View details</button>';

    if (canReturn(order, openReturnOrders)) {
      actions += '<button type="button" class="btn btn--accent js-return" data-number="' + esc(order.number) + '">Request a return</button>';
    } else if (order.status === "delivered" && openReturnOrders.indexOf(order.number) !== -1) {
      actions += '<span class="admin-table__muted" style="align-self:center;font-size:.84rem;">Return in progress</span>';
    } else if (order.status === "delivered") {
      actions += '<span class="admin-table__muted" style="align-self:center;font-size:.84rem;">Return window closed</span>';
    }

    return '<article class="order-card">' +
      '<div class="order-card__head">' +
        "<div>" +
          '<div class="order-card__id">' + esc(order.number) + "</div>" +
          '<div class="order-card__meta">Placed ' + date(order.placedAt) + " · " + units +
            (units === 1 ? " item" : " items") + "</div>" +
        "</div>" +
        '<div class="order-card__right">' + pill(order.status) + ' ' + payBadge(order.paymentMethod, order.paymentStatus) +
          '<span class="order-card__total">' + money(order.total) + "</span></div>" +
      "</div>" +
      '<div class="order-card__body">' +
        '<div class="order-thumbs">' + thumbs + "</div>" +
        '<div class="order-card__foot">' + actions + "</div>" +
      "</div>" +
    "</article>";
  }

  function renderOrders() {
    var list = document.getElementById("orderList");
    document.getElementById("tabOrdersCount").textContent = orders.length ? "(" + orders.length + ")" : "";

    if (!orders.length) {
      list.innerHTML =
        '<div class="cart-empty">' +
          '<span class="cart-empty__icon" aria-hidden="true">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 8H6"/><circle cx="10" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/></svg>' +
          "</span>" +
          "<h2>No orders yet</h2>" +
          "<p>When you place an order it will appear here, with tracking and returns.</p>" +
          '<a href="products.html" class="btn btn--accent btn--lg">Start shopping <span class="btn__arrow" aria-hidden="true">&rarr;</span></a>' +
        "</div>";
      return;
    }

    var openReturnOrders = returns
      .filter(function (r) { return r.status === "requested" || r.status === "approved"; })
      .map(function (r) { return r.orderNumber; });

    list.innerHTML = orders.map(function (order) {
      return orderCard(order, openReturnOrders);
    }).join("");
  }

  function orderDetail(number) {
    api("/orders/" + encodeURIComponent(number)).then(function (data) {
      var order = data.order;

      var items = (order.items || []).map(function (line) {
        return '<div class="admin-cell" style="margin-bottom:14px;">' +
          '<img class="admin-thumb" src="' + esc(line.image) + '" alt="" />' +
          '<div class="admin-cell__text" style="flex:1;">' +
            '<div class="admin-table__strong">' + esc(line.name) + "</div>" +
            '<div class="admin-table__muted">' + line.qty + " × " + money(line.unitPrice) + "</div>" +
          "</div>" +
          '<div class="admin-table__strong">' + money(line.unitPrice * line.qty) + "</div>" +
        "</div>";
      }).join("");

      var timeline = (order.timeline || []).map(function (entry) {
        return '<div class="timeline__item"><span class="timeline__dot"></span><div>' +
          "<div>" + pill(entry.status) + (entry.note ? " " + esc(entry.note) : "") + "</div>" +
          '<div class="timeline__when">' + dateTime(entry.at) + "</div>" +
        "</div></div>";
      }).join("");

      var body =
        progressHtml(order) +
        '<dl class="detail-rows">' +
          '<div class="detail-row"><dt>Status</dt><dd>' + pill(order.status) + "</dd></div>" +
          '<div class="detail-row"><dt>Payment</dt><dd>' + payBadge(order.paymentMethod, order.paymentStatus) + "</dd></div>" +
          '<div class="detail-row"><dt>Placed</dt><dd>' + dateTime(order.placedAt) + "</dd></div>" +
          '<div class="detail-row"><dt>Deliver to</dt><dd>' + esc(order.customer.name) + "<br/>" +
            esc(order.customer.address) + "<br/>" + esc(order.customer.city) + " " + esc(order.customer.postal) +
          "</dd></div>" +
        "</dl>" +
        '<h4 style="font-size:.95rem;margin-bottom:12px;">Items</h4>' + items +
        '<dl class="detail-rows" style="margin-top:16px;">' +
          '<div class="detail-row"><dt>Subtotal</dt><dd>' + money(order.subtotal) + "</dd></div>" +
          '<div class="detail-row"><dt>Shipping</dt><dd>' + (order.shipping === 0 ? "Free" : money(order.shipping)) + "</dd></div>" +
          '<div class="detail-row"><dt>Total</dt><dd style="font-size:1.15rem;">' + money(order.total) + "</dd></div>" +
        "</dl>" +
        '<h4 style="font-size:.95rem;margin:22px 0 12px;">History</h4>' +
        '<div class="timeline">' + timeline + "</div>";

      openDrawer("Order " + order.number, body, null);
    }).catch(function (error) { ui.showToast(error.message); });
  }

  /* ---------- Return request ---------- */

  function returnForm(number) {
    api("/orders/" + encodeURIComponent(number)).then(function (data) {
      var order = data.order;
      var left = Math.max(0, Math.ceil(RETURN_WINDOW_DAYS - daysSinceDelivery(order)));

      var items = (order.items || []).map(function (line, index) {
        return '<label class="return-item">' +
          '<input type="checkbox" class="js-ret-item" data-index="' + index +
            '" data-product="' + line.productId + '" data-max="' + line.qty + '" checked />' +
          '<span class="return-item__info">' +
            '<span class="return-item__name">' + esc(line.name) + "</span>" +
            '<span class="return-item__meta">' + line.qty + " × " + money(line.unitPrice) + "</span>" +
          "</span>" +
          '<input type="number" class="return-item__qty js-ret-qty" value="' + line.qty +
            '" min="1" max="' + line.qty + '" aria-label="Quantity to return for ' + esc(line.name) + '" />' +
        "</label>";
      }).join("");

      var body =
        '<div class="return-note">' +
          "Tell us what is coming back and why. You have <strong>" + left +
          " day" + (left === 1 ? "" : "s") + "</strong> left of the " + RETURN_WINDOW_DAYS +
          "-day window for this order. Items should be in their original packaging." +
        "</div>" +
        '<h4 style="font-size:.95rem;margin-bottom:6px;">What are you returning?</h4>' +
        items +
        '<div class="field" style="margin-top:20px;">' +
          '<label for="returnReason">Why are you returning it?</label>' +
          '<textarea id="returnReason" style="min-height:110px;" placeholder="e.g. It arrived with a scratch on the casing, or it is not the size I expected."></textarea>' +
          '<span class="field-error">Please give us at least 10 characters so we can help properly.</span>' +
        "</div>";

      var foot =
        '<button type="button" class="btn btn--outline" data-close="1">Cancel</button>' +
        '<button type="button" class="btn btn--accent" id="submitReturn">Submit request</button>';

      openDrawer("Return from " + order.number, body, foot);

      // Ticking a line off disables its quantity box.
      drawerBody.addEventListener("change", function (event) {
        var box = event.target.closest(".js-ret-item");
        if (!box) { return; }
        var qty = box.closest(".return-item").querySelector(".js-ret-qty");
        qty.disabled = !box.checked;
      });

      document.getElementById("submitReturn").addEventListener("click", function () {
        var button = this;
        var reason = document.getElementById("returnReason");
        var field = reason.closest(".field");

        if (reason.value.trim().length < 10) {
          field.classList.add("is-invalid");
          reason.focus();
          return;
        }
        field.classList.remove("is-invalid");

        var chosen = [];
        drawerBody.querySelectorAll(".js-ret-item").forEach(function (box) {
          if (!box.checked) { return; }
          var qtyInput = box.closest(".return-item").querySelector(".js-ret-qty");
          chosen.push({
            productId: Number(box.getAttribute("data-product")),
            qty: Math.min(Number(qtyInput.value) || 1, Number(box.getAttribute("data-max")))
          });
        });

        if (!chosen.length) {
          ui.showToast("Pick at least one item to return.");
          return;
        }

        button.disabled = true;
        button.textContent = "Submitting…";

        api("/returns", {
          method: "POST",
          body: { orderNumber: order.number, items: chosen, reason: reason.value.trim() }
        }).then(function (result) {
          closeDrawer();
          ui.showToast("Return " + result.return.reference + " submitted");
          return loadAll();
        }).then(function () {
          // Land the customer on the tab that now has their request.
          var returnsTab = document.querySelector('.acct-tab[data-tab="returns"]');
          if (returnsTab) { returnsTab.click(); }
        }).catch(function (error) {
          ui.showToast(error.message);
          button.disabled = false;
          button.textContent = "Submit request";
        });
      });
    }).catch(function (error) { ui.showToast(error.message); });
  }

  /* ---------- Returns list ---------- */

  function renderReturns() {
    var list = document.getElementById("returnList");
    document.getElementById("tabReturnsCount").textContent = returns.length ? "(" + returns.length + ")" : "";

    if (!returns.length) {
      list.innerHTML =
        '<div class="cart-empty">' +
          '<span class="cart-empty__icon" aria-hidden="true">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 1 3 6.7L3 21"/><path d="M3 21v-5h5"/></svg>' +
          "</span>" +
          "<h2>No returns</h2>" +
          "<p>Started a return? It will show up here with its progress. Delivered orders can be returned within " + RETURN_WINDOW_DAYS + " days.</p>" +
          '<a href="help.html#returns" class="btn btn--outline">Read the returns policy</a>' +
        "</div>";
      return;
    }

    list.innerHTML = returns.map(function (request) {
      var value = (request.items || []).reduce(function (s, l) { return s + l.unitPrice * l.qty; }, 0);
      var items = (request.items || []).map(function (l) {
        return esc(l.name) + " × " + l.qty;
      }).join(", ");

      var note = "";
      if (request.status === "refunded") {
        note = '<div class="return-note" style="margin:14px 0 0;">Refunded <strong>' +
          money(request.refundAmount) + "</strong>" +
          (request.adminNote ? " — " + esc(request.adminNote) : "") +
          ". Allow 3–5 business days for it to reach your account.</div>";
      } else if (request.status === "rejected") {
        note = '<div class="return-note" style="margin:14px 0 0;">This request was not approved' +
          (request.adminNote ? ": " + esc(request.adminNote) : ".") + "</div>";
      } else if (request.status === "approved") {
        note = '<div class="return-note" style="margin:14px 0 0;">Approved' +
          (request.adminNote ? " — " + esc(request.adminNote) : "") +
          ". Send the items back and we will refund you once they arrive.</div>";
      } else {
        note = '<div class="return-note" style="margin:14px 0 0;">We have your request and will review it shortly.</div>';
      }

      return '<article class="order-card">' +
        '<div class="order-card__head">' +
          "<div>" +
            '<div class="order-card__id">' + esc(request.reference) + "</div>" +
            '<div class="order-card__meta">Order ' + esc(request.orderNumber) +
              " · requested " + date(request.createdAt) + "</div>" +
          "</div>" +
          '<div class="order-card__right">' + pill(request.status) +
            '<span class="order-card__total">' + money(value) + "</span></div>" +
        "</div>" +
        '<div class="order-card__body">' +
          '<div class="admin-table__muted" style="font-size:.86rem;">' + items + "</div>" +
          '<div style="margin-top:10px;font-size:.86rem;color:var(--text-body);"><strong>Reason:</strong> ' +
            esc(request.reason) + "</div>" +
          note +
        "</div>" +
      "</article>";
    }).join("");
  }

  /* ---------- Wiring ---------- */

  document.getElementById("orderList").addEventListener("click", function (event) {
    var view = event.target.closest(".js-view");
    if (view) { return orderDetail(view.getAttribute("data-number")); }

    var ret = event.target.closest(".js-return");
    if (ret) { return returnForm(ret.getAttribute("data-number")); }
  });

  function loadAll() {
    return Promise.all([
      api("/orders/mine").catch(function () { return { orders: [] }; }),
      api("/returns/mine").catch(function () { return { returns: [] }; })
    ]).then(function (results) {
      orders = results[0].orders || [];
      returns = results[1].returns || [];
      // Returns must be known before orders render — the cards use them to
      // decide between "Request a return" and "Return in progress".
      renderReturns();
      renderOrders();
    });
  }

  /* ---------- Init ---------- */

  document.addEventListener("DOMContentLoaded", function () {
    var root = document.getElementById("ordersRoot");
    if (!root) { return; }

    Auth.ready().then(function (user) {
      if (!user) {
        window.location.replace("login.html?next=" + encodeURIComponent("orders.html"));
        return;
      }

      root.hidden = false;
      loadAll();

      if ((window.location.hash || "").indexOf("returns") !== -1) {
        var tab = document.querySelector('.acct-tab[data-tab="returns"]');
        if (tab) { tab.click(); }
      }
    });
  });

})(window.NovaCart);
