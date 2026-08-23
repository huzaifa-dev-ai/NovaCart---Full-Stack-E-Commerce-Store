/* =============================================================
   NovaCart — Cart Module
   -------------------------------------------------------------
   Cart state is persisted in localStorage so it survives page
   navigation and refreshes. The cart stores only { id, qty } —
   prices are always re-read from the catalog so a price change
   can never be spoofed from the browser's storage.
   ============================================================= */

window.NovaCart = window.NovaCart || {};

(function (App) {
  "use strict";

  var STORAGE_KEY = "novacart.cart";

  /* ---------- Storage helpers ---------- */

  function read() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      // Private mode / corrupted value — fail soft with an empty cart.
      console.warn("NovaCart: could not read cart —", err);
      return [];
    }
  }

  function write(items) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (err) {
      console.warn("NovaCart: could not save cart —", err);
    }
    document.dispatchEvent(new CustomEvent("cart:updated", { detail: { items: items } }));
  }

  /* ---------- Public API ---------- */

  var Cart = {

    /** @returns {Array<{id:number, qty:number}>} */
    getItems: function () {
      return read();
    },

    /** Total number of units in the cart (used by the navbar badge). */
    getCount: function () {
      return read().reduce(function (sum, item) { return sum + item.qty; }, 0);
    },

    /** Quantity of one product currently in the cart. */
    getQty: function (productId) {
      var id = Number(productId);
      var found = read().filter(function (i) { return i.id === id; })[0];
      return found ? found.qty : 0;
    },

    /**
     * Add a product, or increase its quantity if already present.
     * @returns {number} the product's new quantity
     */
    add: function (productId, qty) {
      var id = Number(productId);
      var amount = Number(qty) > 0 ? Number(qty) : 1;
      var items = read();
      var existing = items.filter(function (i) { return i.id === id; })[0];

      if (existing) {
        existing.qty += amount;
      } else {
        items.push({ id: id, qty: amount });
      }

      write(items);
      return existing ? existing.qty : amount;
    },

    /** Set an exact quantity; 0 or less removes the line. */
    setQty: function (productId, qty) {
      var id = Number(productId);
      var amount = Number(qty);

      if (!amount || amount < 1) { return Cart.remove(id); }

      var items = read();
      var existing = items.filter(function (i) { return i.id === id; })[0];

      if (existing) { existing.qty = amount; }
      else { items.push({ id: id, qty: amount }); }

      write(items);
    },

    /** Remove a product line entirely. */
    remove: function (productId) {
      var id = Number(productId);
      write(read().filter(function (i) { return i.id !== id; }));
    },

    /** Empty the cart. */
    clear: function () {
      write([]);
    }
  };

  App.Cart = Cart;

})(window.NovaCart);
