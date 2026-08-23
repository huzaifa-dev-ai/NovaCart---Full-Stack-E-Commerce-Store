/* =============================================================
   NovaCart — Product data (API-backed)
   -------------------------------------------------------------
   The catalog lives in MongoDB and is served by the Express API:
     GET /api/products             list (filters, paging)
     GET /api/products/categories  categories with counts
     GET /api/products/:id         one product + related items

   This file keeps the exact interface the pages already used —
   getProducts() and getProductById() both return Promises — so
   moving the data to the server required no changes anywhere in
   the UI layer. That was the point of putting the seam here on
   day one.

   Responses are cached in memory for the life of the page, so a
   grid, a details panel and a related-products row share one
   round-trip instead of three.
   ============================================================= */

window.NovaCart = window.NovaCart || {};

(function (App) {
  "use strict";

  /**
   * Same-origin in normal use (Express serves this site). The port check
   * keeps things working if the page is opened through a static dev server
   * on 5500 while the API runs on 5000.
   */
  function apiBase() {
    if (window.location.port === "5500") {
      return "http://localhost:5000/api";
    }
    return "/api";
  }

  /* ---------- Per-page caches ---------- */

  var allProducts = null;      // Promise<Array> once the full list is requested
  var byId = {};               // id -> Promise<{product, related}>
  var categories = null;       // Promise<Array>

  function request(path) {
    return fetch(apiBase() + path, {
      headers: { Accept: "application/json" },
      credentials: "same-origin"
    })
      .catch(function () {
        throw new Error("Can't reach the NovaCart server. Is it running?");
      })
      .then(function (response) {
        return response
          .json()
          .catch(function () { return null; })
          .then(function (data) {
            if (!response.ok) {
              var message = (data && data.error) || "Could not load products.";
              var error = new Error(message);
              error.status = response.status;
              error.code = data && data.code;
              throw error;
            }
            return data;
          });
      });
  }

  /* ---------- Public API ---------- */

  /**
   * The full catalog.
   * @returns {Promise<Array>}
   */
  App.getProducts = function () {
    if (!allProducts) {
      allProducts = request("/products?limit=100").then(function (data) {
        return data.products || [];
      }).catch(function (error) {
        allProducts = null;          // let a later attempt retry
        throw error;
      });
    }
    return allProducts;
  };

  /**
   * One product by its numeric id.
   * @param {number|string} id
   * @returns {Promise<Object|null>} null when it does not exist
   */
  App.getProductById = function (id) {
    var key = String(Number(id));

    if (!byId[key]) {
      byId[key] = request("/products/" + encodeURIComponent(key))
        .then(function (data) {
          return { product: data.product || null, related: data.related || [] };
        })
        .catch(function (error) {
          delete byId[key];
          // A missing product is an answer, not a failure — the details page
          // renders its own "not found" state from a null.
          if (error.status === 404) { return { product: null, related: [] }; }
          throw error;
        });
    }

    return byId[key].then(function (result) { return result.product; });
  };

  /**
   * Products related to the given one, as chosen by the server.
   * @returns {Promise<Array>}
   */
  App.getRelatedProducts = function (id) {
    var key = String(Number(id));
    if (!byId[key]) { App.getProductById(id); }
    return byId[key].then(function (result) { return result.related; });
  };

  /**
   * Category names with product counts.
   * @returns {Promise<Array<{category:string, count:number}>>}
   */
  App.getCategories = function () {
    if (!categories) {
      categories = request("/products/categories").then(function (data) {
        return data.categories || [];
      }).catch(function (error) {
        categories = null;
        throw error;
      });
    }
    return categories;
  };

  /**
   * Filtered query straight to the server, bypassing the page cache.
   * @param {Object} [options] category, badge, search, featured, inStock, sort, page, limit
   * @returns {Promise<Object>} the full envelope: {products, total, page, pages}
   */
  App.queryProducts = function (options) {
    var params = new URLSearchParams();
    Object.keys(options || {}).forEach(function (key) {
      var value = options[key];
      if (value !== undefined && value !== null && value !== "") {
        params.set(key, value);
      }
    });
    var query = params.toString();
    return request("/products" + (query ? "?" + query : ""));
  };

})(window.NovaCart);
