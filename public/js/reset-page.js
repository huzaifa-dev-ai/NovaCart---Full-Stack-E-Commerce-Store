/* =============================================================
   NovaCart — Reset password (reset-password.html)
   -------------------------------------------------------------
   Reads the one-time token from ?token=…, takes a new password,
   and submits both. On success the user is NOT signed in — they
   have proved control of the mailbox, not knowledge of the new
   password, so they log in with it.
   ============================================================= */

(function (App) {
  "use strict";

  var Auth = App.Auth;

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

  function setInvalid(input, invalid) {
    var field = input.closest(".field");
    if (field) { field.classList.toggle("is-invalid", invalid); }
    input.setAttribute("aria-invalid", String(invalid));
    return !invalid;
  }

  document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("resetForm");
    if (!form) { return; }

    var password = document.getElementById("rpPassword");
    var confirm = document.getElementById("rpConfirm");
    var button = document.getElementById("resetBtn");
    var success = document.getElementById("resetSuccess");
    var alertBox = document.getElementById("authAlert");
    var alertText = document.getElementById("authAlertText");
    var meter = document.getElementById("pwStrength");
    var meterLabel = document.getElementById("pwStrengthLabel");

    function showAlert(message) {
      alertText.textContent = message;
      alertBox.classList.add("is-visible");
    }

    var token = new URLSearchParams(window.location.search).get("token") || "";

    // No token at all — the page was opened directly rather than followed
    // from a reset link.
    if (!token) {
      form.hidden = true;
      showAlert("This page needs a reset link. Request one from the sign-in page.");
      return;
    }

    // Password reveal toggles
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

    password.addEventListener("input", function () {
      var score = scorePassword(password.value);
      meter.setAttribute("data-score", String(score));
      meterLabel.textContent = STRENGTH_LABELS[score];
    });

    form.addEventListener("input", function (event) {
      var field = event.target.closest(".field");
      if (field) { field.classList.remove("is-invalid"); }
      alertBox.classList.remove("is-visible");
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      alertBox.classList.remove("is-visible");

      var ok = true;
      ok = setInvalid(password, !passwordOk(password.value)) && ok;
      ok = setInvalid(confirm, confirm.value !== password.value || !confirm.value) && ok;

      if (!ok) {
        var firstBad = form.querySelector('[aria-invalid="true"]');
        if (firstBad) { firstBad.focus(); }
        return;
      }

      button.disabled = true;
      button.textContent = "Updating…";

      Auth.resetPassword(token, password.value)
        .then(function () {
          form.hidden = true;
          success.hidden = false;
        })
        .catch(function (err) {
          showAlert(err && err.message ? err.message : "Could not update your password.");

          // An invalid or expired token can't be fixed by retyping —
          // send them back to request a fresh link.
          if (err && err.code === "RESET_TOKEN_INVALID") {
            form.hidden = true;
            var again = document.createElement("a");
            again.className = "btn btn--accent btn--lg btn--block";
            again.href = "forgot-password.html";
            again.textContent = "Request a new link";
            alertBox.insertAdjacentElement("afterend", again);
            return;
          }

          button.disabled = false;
          button.innerHTML = 'Update Password <span class="btn__arrow" aria-hidden="true">&rarr;</span>';
        });
    });
  });

})(window.NovaCart);
