/* =============================================================
   NovaCart — where the test suites point
   -------------------------------------------------------------
   Hard-coding http://localhost:5000 meant every suite broke the
   day the dev server started serving TLS. This follows APP_URL
   instead, so the tests track however the server is actually
   configured, and TEST_ORIGIN can override it for a one-off run.
   ============================================================= */

require("dotenv").config({ quiet: true });

const ORIGIN = String(
  process.env.TEST_ORIGIN || process.env.APP_URL || "http://localhost:5000"
).replace(/\/+$/, "");

// `npm run cert` produces a self-signed certificate, which Node rightly
// refuses. Relax that ONLY for a loopback origin, and only in the test
// process — never in the server itself.
if (/^https:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(ORIGIN)) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

module.exports = { ORIGIN };
