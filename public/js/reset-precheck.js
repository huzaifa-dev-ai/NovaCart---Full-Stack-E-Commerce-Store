/* =============================================================
   NovaCart — reset page pre-check
   -------------------------------------------------------------
   Loaded SYNCHRONOUSLY from the <head> of forgot-password.html,
   before the body is parsed, so what it decides is what the very
   first paint shows.

   Why it cannot live in forgot-page.js: that runs on
   DOMContentLoaded, by which point the email form has been laid
   out and painted. Hiding it there is a visible blink of "Enter
   your email" on every single reset.

   Two jobs, both cosmetic — the actual sending stays in
   forgot-page.js:

     1. Flag the document so the stylesheet shows the confirmation
        instead of the form.
     2. Write the address into the confirmation the moment the
        parser creates the element, so the sentence is already
        correct rather than being corrected a frame later.
   ============================================================= */

(function () {
  "use strict";

  var RESET_EMAIL_KEY = "novacart.reset.email";
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  var carried;
  try {
    carried = sessionStorage.getItem(RESET_EMAIL_KEY);
  } catch (err) {
    // Private mode, or storage blocked. The form renders as normal and the
    // visitor types the address — slower, but nothing is broken.
    return;
  }

  if (!carried || !EMAIL_RE.test(carried)) { return; }

  document.documentElement.className += " reset-pending";

  // The elements do not exist yet — we are still in <head>. Rather than an
  // inline script further down the page (which would deepen this project's
  // reliance on 'unsafe-inline' in the CSP), watch for the parser to create
  // them. Observer callbacks are microtasks, so this still lands before paint.
  if (typeof MutationObserver !== "function") { return; }

  var done = { address: false, panel: false };

  var observer = new MutationObserver(function () {
    if (!done.address) {
      var slot = document.getElementById("fpAddress");
      if (slot) {
        slot.textContent = carried;
        done.address = true;
      }
    }

    if (!done.panel) {
      var panel = document.getElementById("otpStage");
      if (panel) {
        // The stylesheet cannot do this one. The panel ships with the
        //  attribute, and the user-agent rule behind it wins over an
        // ordinary author rule — so the class alone left a blank card for
        // ~100ms until forgot-page.js got around to clearing it. Removing the
        // attribute here settles it before anything is painted.
        panel.hidden = false;
        done.panel = true;
      }
    }

    if (done.address && done.panel) { observer.disconnect(); }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Belt and braces: if the element never appears, stop watching rather than
  // leaving an observer running for the life of the page.
  document.addEventListener("DOMContentLoaded", function () { observer.disconnect(); });
})();
