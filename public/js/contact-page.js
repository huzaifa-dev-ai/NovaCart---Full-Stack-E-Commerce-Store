/* =============================================================
   NovaCart — Contact page
   -------------------------------------------------------------
   Validates the form client-side, then POSTs to /api/contact,
   which emails the message to the store inbox. Server-side
   validation errors are painted back onto the matching fields.
   ============================================================= */

(function (App) {
  "use strict";

  var ui = App.ui;

  var form = document.getElementById("contactForm");
  var success = document.getElementById("formSuccess");
  if (!form) { return; }

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function apiBase() {
    if (window.location.port === "5500") { return "http://localhost:5000/api"; }
    return "/api";
  }

  function fieldOf(input) {
    return input.closest(".field");
  }

  function setInvalid(input, invalid, message) {
    var field = fieldOf(input);
    field.classList.toggle("is-invalid", invalid);
    input.setAttribute("aria-invalid", String(invalid));
    if (invalid && message) {
      var hint = field.querySelector(".field-error");
      if (hint) { hint.textContent = message; }
    }
    return !invalid;
  }

  function validate() {
    var name = document.getElementById("cfName");
    var email = document.getElementById("cfEmail");
    var message = document.getElementById("cfMessage");

    var okName = setInvalid(name, name.value.trim().length < 2);
    var okEmail = setInvalid(email, !EMAIL_RE.test(email.value.trim()));
    var okMessage = setInvalid(message, message.value.trim().length < 10);

    var firstBad = [name, email, message].filter(function (i) {
      return i.getAttribute("aria-invalid") === "true";
    })[0];
    if (firstBad) { firstBad.focus(); }

    return okName && okEmail && okMessage;
  }

  var FIELD_IDS = { name: "cfName", email: "cfEmail", message: "cfMessage" };

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (!validate()) { return; }

    var button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = "Sending…";

    fetch(apiBase() + "/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name: document.getElementById("cfName").value.trim(),
        email: document.getElementById("cfEmail").value.trim(),
        message: document.getElementById("cfMessage").value.trim()
      })
    })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          return { ok: response.ok, data: data };
        });
      })
      .then(function (result) {
        if (result.ok) {
          form.hidden = true;
          success.hidden = false;
          ui.showToast("Message sent — we'll be in touch");
          return;
        }

        // paint per-field server errors, or fall back to a toast
        var painted = false;
        (result.data.errors || []).forEach(function (item) {
          var el = document.getElementById(FIELD_IDS[item.field]);
          if (el) {
            setInvalid(el, true, item.message);
            if (!painted) { el.focus(); }
            painted = true;
          }
        });
        if (!painted) {
          ui.showToast(result.data.error || "Could not send your message. Please try again.");
        }
        button.disabled = false;
        button.innerHTML = 'Send Message <span class="btn__arrow" aria-hidden="true">&rarr;</span>';
      })
      .catch(function () {
        ui.showToast("Can't reach the server — is it running?");
        button.disabled = false;
        button.innerHTML = 'Send Message <span class="btn__arrow" aria-hidden="true">&rarr;</span>';
      });
  });

  // clear the error state as soon as the user fixes a field
  form.addEventListener("input", function (event) {
    var field = event.target.closest(".field");
    if (field) { field.classList.remove("is-invalid"); }
  });

})(window.NovaCart);
