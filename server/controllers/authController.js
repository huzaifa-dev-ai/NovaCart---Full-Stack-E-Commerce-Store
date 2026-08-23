/* =============================================================
   NovaCart — auth controller
   -------------------------------------------------------------
   POST /api/auth/register   create an account
   POST /api/auth/login      start a session
   POST /api/auth/logout     end a session
   GET  /api/auth/me         who am I?
   ============================================================= */

const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const { signToken, setAuthCookie, clearAuthCookie } = require("../utils/token");
// (clearAuthCookie is used by logout and by the password-reset flow)
const { sendMail } = require("../utils/mailer");
const { resetEmail, welcomeEmail } = require("../utils/emailTemplates");
const { isDev, mailMode, baseUrl } = require("../utils/env");

/**
 * Decides the role for a brand-new account.
 *
 * Role is derived here and never read from the request body, so a
 * crafted payload like {"role":"admin"} cannot escalate privileges.
 * Exactly one address — ADMIN_EMAIL — is allowed to be an admin.
 */
function roleFor(email) {
  const adminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  return adminEmail && email === adminEmail ? "admin" : "customer";
}

/* ---------- POST /api/auth/register ---------- */

async function register(req, res, next) {
  try {
    const { name, email, password } = req.body;

    // Friendly, explicit duplicate check (the unique index below is the
    // real guarantee — this just produces a nicer message in the common case).
    const existing = await User.findOne({ email }).select("_id");
    if (existing) {
      throw ApiError.conflict(
        "An account with this email already exists. Try signing in instead.",
        { code: "EMAIL_TAKEN" }
      );
    }

    const user = await User.create({
      name,
      email,
      password,                 // hashed by the model's pre-save hook
      role: roleFor(email)
    });

    // A fresh signup gets a persistent session — they just proved intent.
    const token = signToken(user, true);
    setAuthCookie(res, token, true);

    res.status(201).json({
      success: true,
      message: `Welcome to NovaCart, ${user.name.split(" ")[0]}!`,
      user: user.toPublic()
    });

    // Welcome email AFTER the response — signup must never wait on (or
    // fail because of) the mail server. The site URL comes from config,
    // not the request Host header (see utils/env.js).
    sendMail({ to: user.email, ...welcomeEmail({ name: user.name, siteUrl: baseUrl(req) }) })
      .catch((err) => console.warn("📧  Welcome email failed:", err.message));
  } catch (error) {
    // Two requests can pass the check above at the same time; the unique
    // index still rejects the loser with duplicate-key error 11000.
    if (error && error.code === 11000) {
      return next(
        ApiError.conflict(
          "An account with this email already exists. Try signing in instead.",
          { code: "EMAIL_TAKEN" }
        )
      );
    }
    next(error);
  }
}

/* ---------- POST /api/auth/login ---------- */

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const remember = req.body.remember === true || req.body.remember === "true";

    const user = await User.findForAuth(email);

    // One identical message for "no such account" and "wrong password".
    // Distinguishing them would let anyone enumerate registered emails.
    const invalid = ApiError.unauthorized(
      "Email or password is incorrect.",
      { code: "INVALID_CREDENTIALS" }
    );

    if (!user) {
      // Still spend time hashing so a missing account isn't detectably
      // faster than a wrong password (timing side-channel).
      await User.prototype.verifyPassword
        .call({ password: "$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin" }, password)
        .catch(() => false);
      throw invalid;
    }

    const ok = await user.verifyPassword(password);
    if (!ok) { throw invalid; }

    user.lastLoginAt = new Date();
    await user.save({ validateBeforeSave: false });

    const token = signToken(user, remember);
    setAuthCookie(res, token, remember);

    res.json({
      success: true,
      message: `Welcome back, ${user.name.split(" ")[0]}!`,
      user: user.toPublic()
    });
  } catch (error) {
    next(error);
  }
}

/* ---------- POST /api/auth/logout ---------- */

function logout(_req, res) {
  clearAuthCookie(res);
  res.json({ success: true, message: "You're signed out." });
}

/* ---------- GET /api/auth/me ---------- */

function me(req, res) {
  res.json({ success: true, user: req.user.toPublic() });
}

/* ---------- POST /api/auth/forgot-password ---------- */

/**
 * Always answers 200 with the same message, whether or not the address is
 * registered. Saying "no such account" here would turn this endpoint into
 * a way to discover which emails have accounts.
 */
async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    const reply = {
      success: true,
      message:
        "If an account exists for that email, a reset link is on its way. " +
        "The link is valid for 30 minutes."
    };

    if (user) {
      const rawToken = user.createPasswordResetToken();
      await user.save({ validateBeforeSave: false });

      // The link's origin comes from configuration (APP_URL), NEVER from the
      // request's Host header. A forged Host would otherwise produce a
      // genuine-looking email pointing at the attacker's domain, handing them
      // the victim's token the moment it is clicked.
      const resetUrl = `${baseUrl(req)}/reset-password.html?token=${rawToken}`;

      // Console mode means no mail leaves the process, so the link is shown
      // locally to keep the flow testable. isDev() is an allowlist — an unset
      // or misspelled NODE_ENV counts as production and never leaks a token.
      if (isDev() && mailMode() === "console") {
        console.log("\n🔑  Password reset link (development only):");
        console.log(`    ${resetUrl}\n`);
        reply.devResetUrl = resetUrl;
      }

      // Fire-and-forget. Awaiting the SMTP round-trip would make responses for
      // registered addresses measurably slower than for unknown ones — the very
      // account-enumeration signal the neutral message above exists to prevent.
      sendMail({ to: user.email, ...resetEmail({ name: user.name, resetUrl }) })
        .catch((err) => console.error("📧  Reset email failed to send:", err.message));
    }

    res.json(reply);
  } catch (error) {
    next(error);
  }
}

/* ---------- POST /api/auth/reset-password ---------- */

async function resetPassword(req, res, next) {
  try {
    const { token, password } = req.body;

    const user = await User.findByResetToken(token);
    if (!user) {
      throw ApiError.badRequest(
        "This reset link is invalid or has expired. Please request a new one.",
        { code: "RESET_TOKEN_INVALID" }
      );
    }

    user.password = password;              // re-hashed by the pre-save hook
    user.passwordResetToken = null;        // single use
    user.passwordResetExpires = null;
    await user.save();                     // also stamps passwordChangedAt

    // Deliberately NOT signed in here: whoever holds the mailbox proved
    // that, not that they know the new password. Make them log in.
    clearAuthCookie(res);

    res.json({
      success: true,
      message: "Your password has been changed. Please sign in with it."
    });
  } catch (error) {
    next(error);
  }
}

/* ---------- PATCH /api/auth/password ---------- */

async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id).select("+password");
    if (!user) {
      throw ApiError.unauthorized("This account no longer exists.");
    }

    const ok = await user.verifyPassword(currentPassword);
    if (!ok) {
      throw ApiError.unauthorized("Your current password is incorrect.", {
        code: "WRONG_PASSWORD"
      });
    }

    if (currentPassword === newPassword) {
      throw ApiError.badRequest("Your new password must be different from the current one.", {
        code: "PASSWORD_UNCHANGED"
      });
    }

    user.password = newPassword;
    await user.save();                     // stamps passwordChangedAt

    // Every other device's token is now invalid. Re-issue one here so the
    // person who made the change isn't logged out of their own session.
    const token = signToken(user, true);
    setAuthCookie(res, token, true);

    res.json({
      success: true,
      message: "Password updated. Other devices have been signed out."
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  register,
  login,
  logout,
  me,
  forgotPassword,
  resetPassword,
  changePassword
};
