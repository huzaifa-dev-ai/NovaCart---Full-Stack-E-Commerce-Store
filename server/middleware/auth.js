/* =============================================================
   NovaCart — auth middleware
   -------------------------------------------------------------
   protect()      — requires a valid session, loads req.user
   requireRole()  — requires a specific role (e.g. "admin")
   attachUser()   — optional: loads the user if signed in, never fails
   ============================================================= */

const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const { COOKIE_NAME, verifyToken } = require("../utils/token");

/** Prefer the httpOnly cookie; accept a Bearer header for API clients. */
function readToken(req) {
  if (req.cookies && req.cookies[COOKIE_NAME]) {
    return req.cookies[COOKIE_NAME];
  }
  const header = req.get("authorization") || "";
  if (header.startsWith("Bearer ")) {
    return header.slice(7).trim();
  }
  return null;
}

/**
 * Require a signed-in user. Populates req.user with a full document.
 * The user is re-read from the database on every request, so a deleted
 * or demoted account loses access immediately rather than when the
 * token happens to expire.
 */
async function protect(req, _res, next) {
  try {
    const token = readToken(req);
    if (!token) {
      throw ApiError.unauthorized("You need to be signed in to do that.", {
        code: "NO_SESSION"
      });
    }

    const payload = verifyToken(token);
    const user = await User.findById(payload.sub);

    if (!user) {
      throw ApiError.unauthorized("This account no longer exists.", {
        code: "USER_GONE"
      });
    }

    // A password change or reset invalidates every token issued before it,
    // so a stolen session dies the moment the owner changes their password.
    if (user.sessionIsStale(payload.pwv, payload.iat)) {
      throw ApiError.unauthorized(
        "Your password was changed. Please sign in again.",
        { code: "PASSWORD_CHANGED" }
      );
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Load req.user when a valid session exists, but never reject.
 * For endpoints that behave differently for guests vs members.
 */
async function attachUser(req, _res, next) {
  try {
    const token = readToken(req);
    if (token) {
      const payload = verifyToken(token);
      const user = await User.findById(payload.sub);
      // Same revocation rule as protect(). Without it a session cancelled
      // by a password change would still be honoured here, and an order
      // would be attributed to an account whose session was supposedly gone.
      req.user = user && !user.sessionIsStale(payload.pwv, payload.iat) ? user : undefined;
    }
  } catch {
    req.user = undefined;      // a bad token simply means "guest" here
  }
  next();
}

/**
 * Gate by role. Must run after protect().
 * @param {...string} roles
 */
function requireRole(...roles) {
  return function roleGuard(req, _res, next) {
    if (!req.user) {
      return next(ApiError.unauthorized("You need to be signed in to do that."));
    }
    if (!roles.includes(req.user.role)) {
      return next(
        ApiError.forbidden("You don't have permission to do that.", {
          code: "INSUFFICIENT_ROLE"
        })
      );
    }
    next();
  };
}

module.exports = { protect, attachUser, requireRole };
