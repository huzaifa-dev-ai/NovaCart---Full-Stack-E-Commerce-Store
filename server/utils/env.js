/* =============================================================
   NovaCart — environment helpers
   -------------------------------------------------------------
   Two rules live here, both learned from real footguns:

   1. DEVELOPMENT IS AN ALLOWLIST, NOT A DENYLIST.
      `NODE_ENV !== "production"` fails OPEN: forget to set the
      variable on a real deploy and every debug affordance — reset
      links in HTTP responses, verbose logs — silently switches on.
      isDev() answers true only for an explicit "development",
      so anything unset or misspelled is treated as production.

   2. SECURITY-SENSITIVE URLS COME FROM CONFIG, NOT THE REQUEST.
      Building a password-reset link from the Host header lets an
      attacker point it at their own domain and harvest the token
      when the victim clicks. baseUrl() prefers APP_URL and only
      falls back to the request in development.
   ============================================================= */

/** True only for an explicit NODE_ENV=development. */
function isDev() {
  return process.env.NODE_ENV === "development";
}

function isProd() {
  return !isDev();
}

/**
 * Which mail transport the process will use. Deterministic from the
 * environment alone, so callers can branch without awaiting the
 * transporter.
 * @returns {"smtp"|"ethereal"|"console"}
 */
function mailMode() {
  if (process.env.SMTP_HOST) { return "smtp"; }
  if (isDev() && process.env.MAIL_ETHEREAL === "true") { return "ethereal"; }
  return "console";
}

/**
 * The site's public origin, e.g. "https://novacart.example".
 *
 * @param {Object} [req] only consulted in development
 * @returns {string} origin with no trailing slash
 */
function baseUrl(req) {
  const configured = String(process.env.APP_URL || "").trim();
  if (configured) { return configured.replace(/\/+$/, ""); }

  // Development convenience only. In production the boot check below
  // guarantees APP_URL is set, so this branch is unreachable there.
  if (req && isDev()) {
    return `${req.protocol}://${req.get("host")}`;
  }

  return "http://localhost:" + (process.env.PORT || 5000);
}

/**
 * Refuse to boot a production process that is missing settings whose
 * absence would be silently insecure rather than obviously broken.
 * @returns {string[]} problems found
 */
function productionChecks() {
  if (isDev()) { return []; }

  const problems = [];

  if (!String(process.env.APP_URL || "").trim()) {
    problems.push(
      "APP_URL is not set. Password-reset links would fall back to the " +
      "request's Host header, which an attacker can forge to steal reset tokens."
    );
  }

  const secret = String(process.env.JWT_SECRET || "");
  if (secret.length < 32) {
    problems.push("JWT_SECRET is missing or shorter than 32 characters.");
  }

  return problems;
}

module.exports = { isDev, isProd, mailMode, baseUrl, productionChecks };
