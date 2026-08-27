/* =============================================================
   NovaCart — Order Success page (success.html)
   -------------------------------------------------------------
   The checkout redirects here as success.html?order=NC-XXXXXX.

   The order is fetched from GET /api/orders/:number, which only
   answers for the order's owner (or an admin) — so someone
   guessing order numbers learns nothing.

   The page still renders if the fetch fails: the order WAS placed,
   and a network hiccup on the confirmation screen shouldn't make
   the customer think otherwise.
   ============================================================= */

(function (App) {
  "use strict";

  var ui = App.ui;

  function apiBase() {
    if (window.location.port === "5500") { return "http://localhost:5000/api"; }
    return "/api";
  }

  function money(value) {
    return "$" + Number(value || 0).toFixed(2);
  }

  document.addEventListener("DOMContentLoaded", function () {
    var numberEl = document.getElementById("orderNumber");
    var recapEl = document.getElementById("orderRecap");
    var messageEl = document.getElementById("orderMessage");
    if (!numberEl) { return; }

    var param = new URLSearchParams(window.location.search).get("order");

    // Shape check before it reaches the page or the URL.
    var orderNumber = param && /^NC-[A-Z0-9]{4,12}$/i.test(param) ? param.toUpperCase() : null;

    if (!orderNumber) {
      numberEl.textContent = "—";
      messageEl.textContent =
        "We couldn't tell which order this is. Check your email for the confirmation, " +
        "or open your account to see recent orders.";
      return;
    }

    numberEl.textContent = orderNumber;
    document.title = "Order " + orderNumber + " Confirmed — NovaCart";

    fetch(apiBase() + "/orders/" + encodeURIComponent(orderNumber), {
      headers: { Accept: "application/json" },
      credentials: "include"
    })
      .then(function (response) {
        if (!response.ok) { throw new Error("not available"); }
        return response.json();
      })
      .then(function (data) {
        var order = data.order;
        if (!order) { return; }

        var units = (order.items || []).reduce(function (sum, line) {
          return sum + line.qty;
        }, 0);

        var paymentParam = new URLSearchParams(window.location.search).get("payment");
        var pmLabels = {
          cod: "Cash on Delivery",
          card: "Credit / Debit Card"
        };
        var pmName = pmLabels[order.paymentMethod] || "Cash on Delivery";
        var statusBadge = "";

        if (order.paymentStatus === "paid" || paymentParam === "success") {
          statusBadge = '<span style="display:inline-block;margin-top:10px;padding:4px 12px;background:#ECFDF5;color:#059669;border-radius:20px;font-weight:700;font-size:0.85rem;">✓ Paid via ' + ui.esc(pmName) + '</span>';
        } else if (order.paymentStatus === "failed" || paymentParam === "failed") {
          statusBadge = '<span style="display:inline-block;margin-top:10px;padding:4px 12px;background:#FEF2F2;color:#DC2626;border-radius:20px;font-weight:700;font-size:0.85rem;">✕ Payment Failed (' + ui.esc(pmName) + ')</span>';
        } else if (order.paymentMethod === "cod") {
          statusBadge = '<span style="display:inline-block;margin-top:10px;padding:4px 12px;background:#F1F5F9;color:#475569;border-radius:20px;font-weight:700;font-size:0.85rem;">💵 Cash on Delivery</span>';
        } else {
          var trxText = order.paymentRef ? ' · Trx ID: ' + ui.esc(order.paymentRef) : '';
          statusBadge = '<span style="display:inline-block;margin-top:10px;padding:4px 12px;background:#FEF3C7;color:#D97706;border-radius:20px;font-weight:700;font-size:0.85rem;">⏳ Payment Verification Pending (' + ui.esc(pmName) + trxText + ')</span>';
        }

        recapEl.innerHTML =
          units + (units === 1 ? " item" : " items") +
          " · " + money(order.total) +
          (order.customer && order.customer.city ? " · delivering to " + ui.esc(order.customer.city) : "") +
          "<br/>" + statusBadge;
        recapEl.hidden = false;

        if (order.customer && order.customer.email) {
          if (order.paymentStatus === "failed" || paymentParam === "failed") {
            messageEl.innerHTML =
              "Your order <strong>" + ui.esc(order.number) + "</strong> was recorded, but the online payment could not be processed. " +
              "Our team will contact you at <strong>" + ui.esc(order.customer.email) + "</strong> to arrange payment.";
          } else {
            messageEl.innerHTML =
              "Your order has been received and is being prepared. A confirmation is on " +
              "its way to <strong>" + ui.esc(order.customer.email) + "</strong>, and we'll " +
              "email you again as soon as it ships.";
          }
        }
      })
      .catch(function () {
        // Not signed in, or the server is unreachable. The order number is
        // still shown — the order exists either way.
      });
  });

})(window.NovaCart);
