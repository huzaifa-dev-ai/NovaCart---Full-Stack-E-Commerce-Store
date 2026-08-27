/* =============================================================
   NovaCart — Google Sign-In configuration
   -------------------------------------------------------------
   We use the OAuth 2.0 Authorization Code flow with PKCE, run
   entirely server-side, rather than the Google Identity Services
   button:

     • the client secret never reaches the browser;
     • no third-party script on the page, so the Content-Security
       -Policy in app.js stays as tight as it is;
     • the session still ends up in the same httpOnly cookie every
       other sign-in uses, so nothing downstream has to change.

   Absent credentials simply disable the feature — the button is
   hidden and the routes answer 503. Nothing else breaks.
   ============================================================= */

const { baseUrl } = require("../utils/env");

/** Google's published endpoints (OpenID Connect discovery document). */
const ENDPOINTS = {
  auth: "https://accounts.google.com/o/oauth2/v2/auth",
  token: "https://oauth2.googleapis.com/token"
};

const google = {
  clientId: process.env.GOOGLE_CLIENT_ID || "",
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",

  /** Only "openid email profile" — we ask for no access to their data. */
  scopes: ["openid", "email", "profile"],

  get configured() {
    return !!(this.clientId && this.clientSecret);
  },

  /**
   * Must match a "Authorized redirect URI" in the Google Cloud console
   * character for character, or Google refuses with redirect_uri_mismatch.
   * Derived from APP_URL so it follows the http/https switch, but can be
   * pinned explicitly when the two need to differ.
   */
  get redirectUri() {
    const explicit = String(process.env.GOOGLE_REDIRECT_URI || "").trim();
    return explicit || `${baseUrl()}/api/auth/google/callback`;
  }
};

module.exports = { google, ENDPOINTS };
