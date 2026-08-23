/* =============================================================
   NovaCart — Forgot password (forgot-password.html)
   -------------------------------------------------------------
   Requests a reset link. The server answers identically whether
   or not the address is registered, so this page must not imply
   anything about whether the account exists.
   ============================================================= */

(function (App) {
  "use strict";

  var Auth = App.Auth;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("forgotForm");
    if (!form) { return; }

    var email = document.getElementById("fpEmail");
    var button = document.getElementById("forgotBtn");
    var success = document.getElementById("forgotSuccess");
    var alertBox = document.getElementById("authAlert");
    var alertText = document.getElementById("authAlertText");

    function showAlert(message) {
      alertText.textContent = message;
      alertBox.classList.add("is-visible");
    }

    form.addEventListener("input", function () {
      email.closest(".field").classList.remove("is-invalid");
      alertBox.classList.remove("is-visible");
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      alertBox.classList.remove("is-visible");

      if (!EMAIL_RE.test(email.value.trim())) {
        email.closest(".field").classList.add("is-invalid");
        email.setAttribute("aria-invalid", "true");
        email.focus();
        return;
      }

      button.disabled = true;
      button.textContent = "Sending…";

      Auth.forgotPassword(email.value)
        .then(function (data) {
          form.hidden = true;
          success.hidden = false;

          // Development conveniences (never present in production):
          //   devResetUrl   — console mode: no mail went out, here's the link
          //   devPreviewUrl — Ethereal mode: the mail was captured, view it
          var devUrl = data && (data.devResetUrl || data.devPreviewUrl);
          if (devUrl) {
            var box = document.getElementById("devLinkBox");
            var link = document.getElementById("devLink");
            if (box && link) {
              link.href = devUrl;
              if (data.devPreviewUrl) {
                link.textContent = "view the sent email (Ethereal preview)";
                link.target = "_blank";
                link.rel = "noopener";
              }
              box.hidden = false;
            }
          }
        })
        .catch(function (err) {
          showAlert(err && err.message ? err.message : "Could not send the reset link. Please try again.");
          button.disabled = false;
          button.innerHTML = 'Send Reset Link <span class="btn__arrow" aria-hidden="true">&rarr;</span>';
        });
    });
  });

})(window.NovaCart);
