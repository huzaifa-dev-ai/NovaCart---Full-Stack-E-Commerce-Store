/* =============================================================
   NovaCart — Forgot password (forgot-password.html)
   -------------------------------------------------------------
   Two steps, both on this page:

     1. A 6-digit code is sent to the address. Usually there is
        nothing to type — the sign-in page hands the address over
        in sessionStorage — so this happens on arrival. The email
        form is still here for anyone landing directly.

     2. The code is exchanged for a single-use token, which is
        carried to reset-password.html to set the new password.

   Why the token travels in sessionStorage rather than the URL:
   it authorises a password change, and a query string ends up in
   history, bookmarks and the Referer header.

   js/reset-precheck.js has already chosen which step is visible,
   from the <head>, so nothing flashes on arrival. This file does
   the work and only moves the layout when the step changes.

   The server answers identically whether or not an address is
   registered, so nothing here may imply that an account exists.
   ============================================================= */

(function (App) {
  "use strict";

  var Auth = App.Auth;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var CODE_RE = /^[0-9]{6}$/;

  // Written by the sign-in page; read here and by js/reset-precheck.js.
  var RESET_EMAIL_KEY = "novacart.reset.email";
  var RESET_SENT_KEY = "novacart.reset.sent";
  var RESET_TOKEN_KEY = "novacart.reset.token";

  // When another code may be requested. Stored rather than kept in a variable
  // so the wait survives a refresh — otherwise reloading the page would hand
  // back a fresh button, and the countdown would be decoration.
  var RESEND_AT_KEY = "novacart.reset.resendAt";

  var RESEND_SECONDS = 60;

  function stored(key) {
    try { return sessionStorage.getItem(key); } catch (err) { return null; }
  }

  function remember(key, value) {
    try { sessionStorage.setItem(key, value); } catch (err) { /* private mode */ }
  }

  function forget(key) {
    try { sessionStorage.removeItem(key); } catch (err) { /* private mode */ }
  }

  document.addEventListener("DOMContentLoaded", function () {
    var emailForm = document.getElementById("forgotForm");
    if (!emailForm) { return; }

    var emailInput = document.getElementById("fpEmail");
    var emailBtn = document.getElementById("forgotBtn");

    var otpStage = document.getElementById("otpStage");
    var otpForm = document.getElementById("otpForm");
    var codeInput = document.getElementById("fpCode");
    var otpBtn = document.getElementById("otpBtn");
    var resendLink = document.getElementById("otpResend");
    var addressSlot = document.getElementById("fpAddress");

    var subtitle = document.getElementById("fpSub");
    var alertBox = document.getElementById("authAlert");
    var alertText = document.getElementById("authAlertText");

    // Which address this page is working on. Set when a code is sent, and
    // needed again to verify — the server matches the code to the address,
    // so the two must not drift apart.
    var address = "";

    function showAlert(message) {
      alertText.textContent = message;
      alertBox.classList.add("is-visible");
    }

    function hideAlert() {
      alertBox.classList.remove("is-visible");
    }

    function clearPrepaintClass() {
      var root = document.documentElement;
      root.className = root.className.replace(/\breset-pending\b/g, "").trim();
    }

    /* ---------- The resend cooldown ---------- */

    var resendTimer = null;

    function resendLabel(secondsLeft) {
      if (secondsLeft <= 0) { return "Send a new code"; }
      var mins = Math.floor(secondsLeft / 60);
      var secs = secondsLeft % 60;
      return "Send a new code in " + mins + ":" + (secs < 10 ? "0" : "") + secs;
    }

    /**
     * Count down to the moment another code may be asked for.
     *
     * The server refuses early requests silently on its own — this exists so
     * the wait is visible rather than looking like a button that does nothing.
     */
    function runCooldown() {
      if (!resendLink) { return; }
      if (resendTimer) { clearInterval(resendTimer); resendTimer = null; }

      var until = Number(stored(RESEND_AT_KEY) || 0);

      function tick() {
        // Recomputed from a timestamp every second rather than counting down a
        // variable, so a backgrounded tab (where timers are throttled) still
        // shows the right number when it comes back.
        var left = Math.ceil((until - Date.now()) / 1000);

        if (left <= 0) {
          resendLink.disabled = false;
          resendLink.textContent = "Send a new code";
          if (resendTimer) { clearInterval(resendTimer); resendTimer = null; }
          forget(RESEND_AT_KEY);
          return;
        }

        resendLink.disabled = true;
        resendLink.textContent = resendLabel(left);
      }

      tick();
      if (until > Date.now()) { resendTimer = setInterval(tick, 1000); }
    }

    /** Start the wait, from now. */
    function beginCooldown() {
      remember(RESEND_AT_KEY, String(Date.now() + RESEND_SECONDS * 1000));
      runCooldown();
    }

    /* ---------- Step 1: send the code ---------- */

    function showEmailStep(message) {
      clearPrepaintClass();
      otpStage.hidden = true;
      emailForm.hidden = false;
      if (subtitle) {
        subtitle.hidden = false;
        if (message) { subtitle.textContent = message; }
      }
      emailBtn.disabled = false;
      emailBtn.innerHTML = 'Send Code <span class="btn__arrow" aria-hidden="true">&rarr;</span>';
    }

    function showCodeStep(to) {
      emailForm.hidden = true;
      otpStage.hidden = false;
      if (subtitle) { subtitle.hidden = true; }
      if (addressSlot && to) { addressSlot.textContent = to; }
      if (codeInput) {
        codeInput.value = "";
        // Only focus once the step is actually on screen; focusing a hidden
        // field silently does nothing and loses the caret.
        try { codeInput.focus(); } catch (err) { /* not focusable yet */ }
      }
    }

    /** Development helper — only ever present when no mail service is set up. */
    function showDevCode(data) {
      if (!data || !data.devResetCode) { return; }
      var box = document.getElementById("devCodeBox");
      var slot = document.getElementById("devCode");
      if (!box || !slot) { return; }
      slot.textContent = data.devResetCode;
      box.hidden = false;
    }

    /**
     * @param {string} to
     * @param {boolean} auto true when sent on arrival rather than by a click
     */
    function sendCode(to, auto) {
      hideAlert();
      emailBtn.disabled = true;
      emailBtn.textContent = "Sending…";

      return Auth.forgotPassword(to)
        .then(function (data) {
          address = to;
          remember(RESET_SENT_KEY, to);
          showCodeStep(to);
          showDevCode(data);
          beginCooldown();
        })
        .catch(function (err) {
          // Fall back to the email step rather than stranding them on a code
          // box for a code that was never sent.
          if (auto) {
            showEmailStep("We couldn't send the code automatically. Check the address and try again.");
            emailInput.value = to;
          }
          showAlert(err && err.message
            ? err.message
            : "Could not send the code. Please try again.");
          emailBtn.disabled = false;
          emailBtn.innerHTML = 'Send Code <span class="btn__arrow" aria-hidden="true">&rarr;</span>';
        });
    }

    emailForm.addEventListener("input", function () {
      emailInput.closest(".field").classList.remove("is-invalid");
      hideAlert();
    });

    emailForm.addEventListener("submit", function (event) {
      event.preventDefault();

      var typed = emailInput.value.trim();
      if (!EMAIL_RE.test(typed)) {
        emailInput.closest(".field").classList.add("is-invalid");
        emailInput.setAttribute("aria-invalid", "true");
        emailInput.focus();
        return;
      }

      remember(RESET_EMAIL_KEY, typed);
      sendCode(typed, false);
    });

    /* ---------- Step 2: verify the code ---------- */

    otpForm.addEventListener("input", function () {
      codeInput.closest(".field").classList.remove("is-invalid");
      hideAlert();
    });

    // Digits only. Stripping as they type beats rejecting afterwards, and it
    // makes a pasted code with spaces or dashes just work.
    codeInput.addEventListener("input", function () {
      var digits = codeInput.value.replace(/\D+/g, "").slice(0, 6);
      if (digits !== codeInput.value) { codeInput.value = digits; }
    });

    otpForm.addEventListener("submit", function (event) {
      event.preventDefault();

      var code = codeInput.value.trim();
      if (!CODE_RE.test(code)) {
        codeInput.closest(".field").classList.add("is-invalid");
        codeInput.setAttribute("aria-invalid", "true");
        codeInput.focus();
        return;
      }

      if (!address) {
        showAlert("We're not sure which address this code is for. Please start again.");
        showEmailStep();
        return;
      }

      hideAlert();
      otpBtn.disabled = true;
      otpBtn.textContent = "Checking…";

      Auth.verifyResetOtp(address, code)
        .then(function (data) {
          if (!data || !data.token) {
            throw new Error("Could not verify that code. Please try again.");
          }

          // The address has done its job; the token takes over from here.
          remember(RESET_TOKEN_KEY, data.token);
          forget(RESET_EMAIL_KEY);
          forget(RESET_SENT_KEY);

          window.location.href = "reset-password.html";
        })
        .catch(function (err) {
          showAlert(err && err.message
            ? err.message
            : "That code is incorrect or has expired.");
          codeInput.closest(".field").classList.add("is-invalid");
          codeInput.value = "";
          codeInput.focus();
          otpBtn.disabled = false;
          otpBtn.innerHTML = 'Verify Code <span class="btn__arrow" aria-hidden="true">&rarr;</span>';
        });
    });

    /* ---------- Asking for another one ---------- */

    if (resendLink) {
      resendLink.addEventListener("click", function (event) {
        event.preventDefault();
        if (resendLink.disabled) { return; }
        if (!address) { showEmailStep(); return; }

        resendLink.disabled = true;
        resendLink.textContent = "Sending…";

        // A new code replaces the old one server-side, which also resets the
        // guess counter — so this is the way out of a burnt-out code.
        Auth.forgotPassword(address)
          .then(function (data) {
            showAlert("A new code is on its way.");
            showDevCode(data);
            if (codeInput) { codeInput.value = ""; codeInput.focus(); }
            beginCooldown();
          })
          .catch(function (err) {
            showAlert(err && err.message ? err.message : "Could not send a new code.");
            // Let them try again rather than stranding the button mid-wait.
            forget(RESEND_AT_KEY);
            runCooldown();
          });
      });
    }

    /* ---------- Arriving from the sign-in page ---------- */

    var carried = stored(RESET_EMAIL_KEY);
    if (!carried || !EMAIL_RE.test(carried)) { return; }

    emailInput.value = carried;
    address = carried;

    if (stored(RESET_SENT_KEY) === carried) {
      // Already sent in this tab — a refresh should return to the code box,
      // not quietly spend another request against the hourly limit.
      showCodeStep(carried);
      runCooldown();            // pick the wait back up where it left off
      return;
    }

    sendCode(carried, true);
  });

})(window.NovaCart);
