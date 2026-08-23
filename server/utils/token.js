/* =============================================================
   NovaCart — JWT issuing and verification
   -------------------------------------------------------------
   The token is delivered in an httpOnly cookie. That keeps it out
   of reach of JavaScript, so an XSS bug cannot steal the session
   the way it could from localStorage.

   The payload carries only the user id and role — never the name,
   email or anything else, since a JWT payload is merely base64
   encoded and readable by anyone holding the token.
   ============================================================= */

const jwt = require("jsonwebtoken");
const ApiError = require("./ApiError");

const COOKIE_NAME = "novacart_token";

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) {
    // Refuse to run with a weak or missing secret rather than issue
    // tokens anyone could forge.
    throw new Error(
      "JWT_SECRET is missing or too short (needs 32+ characters). Set it in .env."
    );
  }
  return value;
}

/**
 * @param {Object} user
 * @param {boolean} [remember] long-lived session vs until-browser-closes
 * @returns {string} signed JWT
 */
function signToken(user, remember) {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role },
    secret(),
    {
      // The JWT lifetime mirrors the cookie so neither outlives the other.
      expiresIn: remember
        ? (process.env.JWT_EXPIRES_IN || "30d")
        : (process.env.JWT_SESSION_EXPIRES_IN || "1d"),
      issuer: "novacart"
    }
  );
}

/**
 * @returns {Object} decoded payload
 * @throws {ApiError} 401 with a reason the frontend can act on
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, secret(), { issuer: "novacart" });
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      throw ApiError.unauthorized("Your session has expired — please sign in again.", {
        code: "TOKEN_EXPIRED"
      });
    }
    throw ApiError.unauthorized("Invalid session — please sign in again.", {
      code: "TOKEN_INVALID"
    });
  }
}

/**
 * Attach the session cookie.
 *
 * remember = true  → persistent cookie, survives a browser restart
 * remember = false → session cookie (no maxAge), cleared when the browser
 *                    closes, which is what "don't keep me signed in" means
 */
function setAuthCookie(res, token, remember) {
  const options = {
    httpOnly: true,                                  // unreadable from JS
    sameSite: "lax",                                 // survives normal navigation, blocks CSRF from other sites
    secure: process.env.NODE_ENV === "production",   // HTTPS only once deployed
    path: "/"
  };

  if (remember) {
    const days = Number(process.env.JWT_COOKIE_DAYS) || 30;
    options.maxAge = days * 24 * 60 * 60 * 1000;
  }

  res.cookie(COOKIE_NAME, token, options);
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/"
  });
}

module.exports = { COOKIE_NAME, signToken, verifyToken, setAuthCookie, clearAuthCookie };
