/* =============================================================
   NovaCart — Auth Module (API-backed)
   -------------------------------------------------------------
   Talks to the Express/MongoDB backend:
     POST /api/auth/register
     POST /api/auth/login
     POST /api/auth/logout
     GET  /api/auth/me

   The session itself is an httpOnly cookie issued by the server.
   JavaScript cannot read it — that is the point, since it means
   an XSS bug cannot steal the session the way it could from
   localStorage.

   Because of that, "am I signed in?" cannot be answered from the
   cookie. Instead:
     • a NON-SENSITIVE copy of the user (name, email, role — never
       a token) is cached in localStorage so the navbar can render
       instantly on load with no flicker;
     • on every page load the cache is reconciled against
       GET /api/auth/me, which is the real source of truth;
     • pages react to the "auth:changed" event when that lands.

   The cache is a rendering convenience, never an authority: the
   server re-checks the cookie on every protected request, so
   editing localStorage grants nothing.
   ============================================================= */

window.NovaCart = window.NovaCart || {};

(function (App) {
  "use strict";

  var CACHE_KEY = "novacart.user";

  /**
   * Same-origin in normal use (the Express server serves this site).
   * The port check keeps things working if the page is opened through
   * the static dev server on 5500 while the API runs on 5000.
   */
  function apiBase() {
    if (window.location.port === "5500") {
      return "http://localhost:5000/api";
    }
    return "/api";
  }

  /* ---------- Cached user ---------- */

  var current = null;      // in-memory copy, authoritative for this page
  var hydrated = null;     // Promise resolving once /me has answered

  function readCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      var parsed = raw ? JSON.parse(raw) : null;
      return parsed && parsed.email ? parsed : null;
    } catch (err) {
      return null;
    }
  }

  function writeCache(user) {
    var changed = JSON.stringify(current) !== JSON.stringify(user);
    current = user || null;

    try {
      if (user) { localStorage.setItem(CACHE_KEY, JSON.stringify(user)); }
      else { localStorage.removeItem(CACHE_KEY); }
    } catch (err) { /* private mode — memory copy still works */ }

    if (changed) {
      document.dispatchEvent(new CustomEvent("auth:changed", { detail: { user: current } }));
    }
    return current;
  }

  current = readCache();

  /* ---------- Errors ---------- */

  /**
   * Turn an API error response into a consistent rejection value:
   *   { status, message, code, errors:[{field,message}], field }
   * `field` is the first offending field, which the forms use to
   * highlight the right input.
   */
  function toError(status, data) {
    var payload = data || {};
    var errors = Array.isArray(payload.errors) ? payload.errors : [];

    var error = new Error(payload.error || "Something went wrong. Please try again.");
    error.status = status;
    error.message = payload.error || error.message;
    error.code = payload.code || null;
    error.errors = errors;
    error.field = errors.length ? errors[0].field : fieldFromCode(payload.code);
    return error;
  }

  function fieldFromCode(code) {
    if (code === "EMAIL_TAKEN") { return "email"; }
    if (code === "INVALID_CREDENTIALS") { return "password"; }
    return null;
  }

  function networkError() {
    var error = new Error(
      "Can't reach the NovaCart server. Make sure it's running (npm start) and try again."
    );
    error.status = 0;
    error.code = "NETWORK";
    error.errors = [];
    error.field = null;
    return error;
  }

  /* ---------- Fetch wrapper ---------- */

  function request(path, options) {
    var config = options || {};
    var init = {
      method: config.method || "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "include"          // carry the session cookie
    };
    if (config.body) { init.body = JSON.stringify(config.body); }

    return fetch(apiBase() + path, init)
      .catch(function () { throw networkError(); })
      .then(function (response) {
        return response
          .json()
          .catch(function () { return null; })
          .then(function (data) {
            if (!response.ok) { throw toError(response.status, data); }
            return data;
          });
      });
  }

  /* ---------- Public API ---------- */

  var Auth = {

    /** Cached user, or null. Synchronous — safe to call during render. */
    getUser: function () {
      return current;
    },

    isSignedIn: function () {
      return current !== null;
    },

    firstName: function () {
      if (!current || !current.name) { return ""; }
      return current.name.trim().split(/\s+/)[0];
    },

    isAdmin: function () {
      return !!current && current.role === "admin";
    },

    /**
     * Ask the server who we are and reconcile the cache.
     * Runs once per page; later calls return the same promise unless
     * `force` is set.
     * @returns {Promise<Object|null>}
     */
    refresh: function (force) {
      if (hydrated && !force) { return hydrated; }

      hydrated = request("/auth/me")
        .then(function (data) {
          return writeCache(data && data.user ? data.user : null);
        })
        .catch(function (error) {
          // 401 simply means "not signed in" — clear any stale cache.
          if (error.status === 401) { return writeCache(null); }
          // A network failure shouldn't sign the user out; keep the cache
          // so the UI stays usable while the server is restarting.
          return current;
        });

      return hydrated;
    },

    /** Resolves once the first /me round-trip has settled. */
    ready: function () {
      return hydrated || Auth.refresh();
    },

    /**
     * @returns {Promise<Object>} the created user
     * @throws  rejection carrying {message, code, errors, field}
     */
    register: function (details) {
      return request("/auth/register", {
        method: "POST",
        body: {
          name: String(details.name || "").trim(),
          email: String(details.email || "").trim().toLowerCase(),
          password: String(details.password || "")
        }
      }).then(function (data) {
        hydrated = Promise.resolve(data.user);
        return writeCache(data.user);
      });
    },

    /**
     * @returns {Promise<Object>} the signed-in user
     * @throws  rejection carrying {message, code, errors, field}
     */
    login: function (credentials) {
      return request("/auth/login", {
        method: "POST",
        body: {
          email: String(credentials.email || "").trim().toLowerCase(),
          password: String(credentials.password || ""),
          // false -> the server issues a session cookie that dies with the browser
          remember: credentials.remember === true
        }
      }).then(function (data) {
        hydrated = Promise.resolve(data.user);
        return writeCache(data.user);
      });
    },

    /**
     * Ends the session server-side (clears the cookie), then locally.
     * Resolves even if the request fails — the local session is dropped
     * either way, so the user is never stuck looking signed in.
     * @returns {Promise<void>}
     */
    /**
     * Ask for a reset code. Always resolves the same way whether or not the
     * address is registered — the server refuses to confirm which emails exist.
     * @returns {Promise<Object>}
     */
    forgotPassword: function (email) {
      return request("/auth/forgot-password", {
        method: "POST",
        body: { email: String(email || "").trim().toLowerCase() }
      });
    },

    /**
     * Complete a reset with the token from the emailed link.
     * Does NOT sign the user in — they must log in with the new password.
     * @returns {Promise<Object>}
     */
    /**
     * Exchange the emailed 6-digit code for the single-use token that
     * authorises the password change.
     * @returns {Promise<{token: string}>}
     */
    verifyResetOtp: function (email, code) {
      return request("/auth/verify-otp", {
        method: "POST",
        body: {
          email: String(email || "").trim().toLowerCase(),
          code: String(code || "").trim()
        }
      });
    },

    resetPassword: function (token, password) {
      return request("/auth/reset-password", {
        method: "POST",
        body: { token: String(token || ""), password: String(password || "") }
      });
    },

    /**
     * Change the password of the signed-in user. Signs out other devices.
     * @returns {Promise<Object>}
     */
    changePassword: function (currentPassword, newPassword) {
      return request("/auth/password", {
        method: "PATCH",
        body: {
          currentPassword: String(currentPassword || ""),
          newPassword: String(newPassword || "")
        }
      });
    },

    logout: function () {
      return request("/auth/logout", { method: "POST" })
        .catch(function () { /* clear locally regardless */ })
        .then(function () {
          hydrated = Promise.resolve(null);
          writeCache(null);
        });
    }
  };

  App.Auth = Auth;

  // Kick off reconciliation immediately; pages don't have to ask.
  Auth.refresh();

  // Signing in or out in another tab should update this one.
  window.addEventListener("storage", function (event) {
    if (event.key === CACHE_KEY) {
      current = readCache();
      document.dispatchEvent(new CustomEvent("auth:changed", { detail: { user: current } }));
    }
  });

})(window.NovaCart);
