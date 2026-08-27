/* =============================================================
   NovaCart — Auth pages (login.html / register.html)
   -------------------------------------------------------------
   Shared behaviour for both forms: validation, password reveal,
   strength meter, and the redirect back to wherever the user
   came from (?next=…).
   ============================================================= */

(function (App) {
  "use strict";

  var ui = App.ui;
  var Auth = App.Auth;

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  /* ---------- Where to go after signing in ---------- */

  var SAFE_NEXT = [
    "index.html", "products.html", "product.html", "cart.html",
    "checkout.html", "about.html", "contact.html", "help.html",
    "admin.html", "orders.html"
  ];

  /** Only same-site page names are honoured — never an arbitrary URL. */
  function nextUrl() {
    var raw = new URLSearchParams(window.location.search).get("next");
    if (!raw) { return "index.html"; }
    var page = raw.split("?")[0].split("#")[0].replace(/^\.?\//, "");
    if (SAFE_NEXT.indexOf(page) === -1) { return "index.html"; }
    return raw.replace(/^\.?\//, "");
  }

  /**
   * Where to send someone once they're in.
   *
   * An explicit ?next= wins — it means they were sent here from a specific
   * page (a gated cart, say) and expect to land back there. Otherwise
   * admins go to their dashboard and customers go to the store.
   */
  function destinationFor(user) {
    var explicit = new URLSearchParams(window.location.search).get("next");
    if (explicit) { return nextUrl(); }
    if (user && user.role === "admin") { return "admin.html"; }
    return "index.html";
  }

  /** Carry ?next= across the login ⇄ register links. */
  function keepNextOnLink(id) {
    var link = document.getElementById(id);
    if (!link) { return; }
    var raw = new URLSearchParams(window.location.search).get("next");
    if (raw) { link.href += "?next=" + encodeURIComponent(raw); }
  }

  /* ---------- Handing the address to the reset flow ---------- */

  // Kept in sessionStorage rather than the query string: a reset request is
  // about a specific mailbox, and a URL ends up in history, bookmarks and the
  // Referer header. sessionStorage stays in this tab and dies with it.
  var RESET_EMAIL_KEY = "novacart.reset.email";
  var RESET_SENT_KEY = "novacart.reset.sent";

  /**
   * "Forgot password?" should not ask for the address a second time — it is
   * already in the box above the link. If it is NOT, there is nothing to send
   * to, so stay put and ask for it here rather than on the next page.
   */
  function initForgotLink() {
    var link = document.getElementById("forgotLink");
    var field = document.getElementById("liEmail");
    if (!link || !field) { return; }

    link.addEventListener("click", function (event) {
      var value = field.value.trim();

      if (!EMAIL_RE.test(value)) {
        event.preventDefault();
        setInvalid(field, true);
        field.setAttribute("aria-invalid", "true");
        field.focus();
        showAlert(value
          ? "That email address doesn't look right. Correct it and we'll send the code there."
          : "Enter your email address first — we'll send the code straight to it.");
        return;
      }

      try {
        sessionStorage.setItem(RESET_EMAIL_KEY, value);
        // A different address than last time means a genuinely new request.
        sessionStorage.removeItem(RESET_SENT_KEY);
      } catch (err) {
        // Private mode: the next page falls back to asking, which still works.
      }
      // The href does the navigating, so this keeps working without JS too.
    });
  }

  /* ---------- Google Sign-In ---------- */

  /**
   * Why the OAuth failures are spelled out here rather than in a JSON
   * response: the callback is reached by browser navigation, so the server
   * can only hand us a short code on the query string. It deliberately
   * keeps that code coarse -- the detail goes to the server log, not to
   * whoever happens to be driving the browser.
   */
  var GOOGLE_ERRORS = {
    google_denied: "Google sign-in was cancelled. You can try again or use your email and password.",
    google_state: "That sign-in link expired before it was used. Please try again.",
    google_unverified: "Google hasn't verified the email address on that account, so we can't use it to sign in.",
    google_disabled: "Google sign-in isn't available right now. Please use your email and password.",
    google_failed: "We couldn't complete sign-in with Google. Please try again.",
    google_conflict: "That email is already linked to a different Google account. Please sign in with the original one, or use your email and password.",
    google_no_account: "There's no NovaCart account for that Google account yet. Create one below and you'll be signed in.",
    google_already_registered: "You already have a NovaCart account with that email — sign in below instead.",
    google_rate_limited: "Too many sign-in attempts. Please wait a few minutes and try again.",
    google_no_intent: "Please use the Continue with Google button on this page rather than a saved link."
  };

  /** Report a failed round trip, then scrub it from the address bar. */
  function showOAuthError() {
    var params = new URLSearchParams(window.location.search);
    var code = params.get("error");
    if (!code || !GOOGLE_ERRORS[code]) { return; }

    showAlert(GOOGLE_ERRORS[code]);

    // Leaving ?error= in place means a refresh, or a bookmark, replays a
    // stale message at someone who has since signed in perfectly well.
    params.delete("error");
    var rest = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (rest ? "?" + rest : ""));
  }

  /**
   * Reveal the button only once the server confirms it holds Google
   * credentials. A button that always renders and sometimes 503s is worse
   * than one that isn't offered.
   */
  function initGoogle() {
    var block = document.getElementById("googleBlock");
    var button = document.getElementById("googleBtn");
    if (!block || !button) { return; }

    fetch("/api/auth/google/status", { credentials: "same-origin" })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (data && data.enabled) { block.hidden = false; }
      })
      .catch(function () { /* offline or blocked -- the email form still works */ });

    button.addEventListener("click", function (event) {
      event.preventDefault();

      // Start from the element's OWN href, so the gate in the markup and the
      // gate a click sends can never disagree. Rebuilding the path here once
      // meant a middle-click — which fires auxclick, not click — followed the
      // bare href and ran the other gate entirely.
      var target = new URL(button.getAttribute("href") || "/api/auth/google",
                           window.location.origin);
      var params = target.searchParams;

      // Carry the page they were originally headed for. The server checks
      // this against its own allowlist too -- never trust the round trip.
      var wanted = new URLSearchParams(window.location.search).get("next");
      if (wanted) { params.set("next", wanted); }

      // Honour "Keep me signed in" when the login page offers it, so the
      // Google path produces the same kind of session as the email path.
      var remember = document.getElementById("liRemember");
      if (remember && !remember.checked) { params.set("remember", "false"); }

      window.location.href = target.pathname + target.search;
    });
  }

  /* ---------- Field helpers ---------- */

  function setInvalid(input, invalid) {
    var field = input.closest(".field");
    if (field) { field.classList.toggle("is-invalid", invalid); }
    input.setAttribute("aria-invalid", String(invalid));
    return !invalid;
  }

  function showAlert(message) {
    var box = document.getElementById("authAlert");
    var text = document.getElementById("authAlertText");
    if (!box) { return; }
    text.textContent = message;
    box.classList.add("is-visible");
  }

  /**
   * Paint the server's per-field validation messages onto the matching
   * inputs. `map` translates API field names to element ids, since the
   * form uses prefixed ids (li… / rg…).
   */
  function applyServerErrors(error, map) {
    var list = (error && error.errors) || [];
    var firstEl = null;

    list.forEach(function (item) {
      var el = document.getElementById(map[item.field]);
      if (!el) { return; }
      var field = el.closest(".field");
      if (field) {
        var hint = field.querySelector(".field-error");
        if (hint && item.message) { hint.textContent = item.message; }
      }
      setInvalid(el, true);
      if (!firstEl) { firstEl = el; }
    });

    // No field list (e.g. 401 / 409) — fall back to the single hinted field.
    if (!firstEl && error && error.field && map[error.field]) {
      firstEl = document.getElementById(map[error.field]);
      if (firstEl) { setInvalid(firstEl, true); }
    }

    if (firstEl) { firstEl.focus(); }
  }

  function hideAlert() {
    var box = document.getElementById("authAlert");
    if (box) { box.classList.remove("is-visible"); }
  }

  /* ---------- Password reveal ---------- */

  function initPasswordToggles() {
    document.addEventListener("click", function (event) {
      var btn = event.target.closest(".js-pw-toggle");
      if (!btn) { return; }

      var input = document.getElementById(btn.getAttribute("data-target"));
      if (!input) { return; }

      var reveal = input.type === "password";
      input.type = reveal ? "text" : "password";
      btn.setAttribute("aria-pressed", String(reveal));
      btn.setAttribute("aria-label", reveal ? "Hide password" : "Show password");
      input.focus();
    });
  }

  /* ---------- Password strength ---------- */

  var STRENGTH_LABELS = [
    "Use 8+ characters with a letter and a number",
    "Weak — add length and a number",
    "Fair — add a capital or symbol",
    "Good password",
    "Strong password"
  ];

  function scorePassword(value) {
    if (!value) { return 0; }
    var score = 0;
    if (value.length >= 8) { score++; }
    if (value.length >= 12) { score++; }
    if (/[A-Z]/.test(value) && /[a-z]/.test(value)) { score++; }
    if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) { score++; }
    else if (/\d/.test(value) || /[^A-Za-z0-9]/.test(value)) { score += 0.5; }
    return Math.max(1, Math.min(4, Math.round(score)));
  }

  function passwordOk(value) {
    return value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value);
  }

  /* ---------- Login ---------- */

  function initLogin(form) {
    var email = document.getElementById("liEmail");
    var password = document.getElementById("liPassword");
    var remember = document.getElementById("liRemember");
    var button = document.getElementById("loginBtn");

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      hideAlert();

      var ok = true;
      ok = setInvalid(email, !EMAIL_RE.test(email.value.trim())) && ok;
      ok = setInvalid(password, password.value.length < 1) && ok;

      if (!ok) {
        var firstBad = form.querySelector('[aria-invalid="true"]');
        if (firstBad) { firstBad.focus(); }
        return;
      }

      button.disabled = true;
      button.textContent = "Signing in…";

      Auth.login({
        email: email.value,
        password: password.value,
        remember: remember.checked
      })
        .then(function (user) {
          ui.showToast("Welcome back, " + user.name.split(" ")[0] + "!");
          window.location.href = destinationFor(user);
        })
        .catch(function (err) {
          showAlert(err && err.message ? err.message : "Sorry — we couldn't sign you in.");
          applyServerErrors(err, { email: "liEmail", password: "liPassword" });

          // Never leave a rejected password sitting in the box.
          password.value = "";
          if (document.activeElement !== email) { password.focus(); }

          button.disabled = false;
          button.innerHTML = 'Sign In <span class="btn__arrow" aria-hidden="true">&rarr;</span>';
        });
    });

    keepNextOnLink("toRegister");
  }

  /* ---------- Register ---------- */

  function initRegister(form) {
    var name = document.getElementById("rgName");
    var email = document.getElementById("rgEmail");
    var password = document.getElementById("rgPassword");
    var confirm = document.getElementById("rgConfirm");
    var terms = document.getElementById("rgTerms");
    var button = document.getElementById("registerBtn");
    var meter = document.getElementById("pwStrength");
    var meterLabel = document.getElementById("pwStrengthLabel");

    password.addEventListener("input", function () {
      var score = scorePassword(password.value);
      meter.setAttribute("data-score", String(score));
      meterLabel.textContent = STRENGTH_LABELS[score];
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      hideAlert();

      var ok = true;
      ok = setInvalid(name, name.value.trim().length < 3) && ok;
      ok = setInvalid(email, !EMAIL_RE.test(email.value.trim())) && ok;
      ok = setInvalid(password, !passwordOk(password.value)) && ok;
      ok = setInvalid(confirm, confirm.value !== password.value || !confirm.value) && ok;
      ok = setInvalid(terms, !terms.checked) && ok;

      if (!ok) {
        var firstBad = form.querySelector('[aria-invalid="true"]');
        if (firstBad) { firstBad.focus(); }
        return;
      }

      button.disabled = true;
      button.textContent = "Creating account…";

      Auth.register({
        name: name.value,
        email: email.value,
        password: password.value
      })
        .then(function (user) {
          ui.showToast("Welcome to NovaCart, " + user.name.split(" ")[0] + "!");
          window.location.href = destinationFor(user);
        })
        .catch(function (err) {
          showAlert(err && err.message ? err.message : "Sorry — we couldn't create your account.");
          applyServerErrors(err, {
            name: "rgName",
            email: "rgEmail",
            password: "rgPassword"
          });
          button.disabled = false;
          button.innerHTML = 'Create Account <span class="btn__arrow" aria-hidden="true">&rarr;</span>';
        });
    });

    keepNextOnLink("toLogin");
  }

  /* ---------- Init ---------- */

  document.addEventListener("DOMContentLoaded", function () {
    var login = document.getElementById("loginForm");
    var register = document.getElementById("registerForm");
    if (!login && !register) { return; }

    // Already signed in? Bounce onward — but only once the server has
    // confirmed it. Trusting the local cache could redirect someone whose
    // session has actually expired, trapping them in a loop.
    Auth.ready().then(function (user) {
      if (user) { window.location.replace(destinationFor(user)); }
    });

    showOAuthError();
    initGoogle();
    initForgotLink();
    initPasswordToggles();

    var form = login || register;
    // clear the error state as soon as a field is edited
    form.addEventListener("input", function (event) {
      var field = event.target.closest(".field");
      if (field) { field.classList.remove("is-invalid"); }
    });
    form.addEventListener("change", function (event) {
      var field = event.target.closest(".field");
      if (field) { field.classList.remove("is-invalid"); }
    });

    if (login) { initLogin(login); }
    if (register) { initRegister(register); }
  });

})(window.NovaCart);
