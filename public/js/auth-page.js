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
