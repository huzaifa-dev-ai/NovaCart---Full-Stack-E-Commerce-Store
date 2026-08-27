/* =============================================================
   NovaCart — auth controller
   -------------------------------------------------------------
   POST /api/auth/register   create an account
   POST /api/auth/login      start a session
   POST /api/auth/logout     end a session
   GET  /api/auth/me         who am I?
   ============================================================= */

const crypto = require("crypto");

const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const { signToken, setAuthCookie, clearAuthCookie } = require("../utils/token");
// (clearAuthCookie is used by logout and by the password-reset flow)
const { sendMail } = require("../utils/mailer");
const { resetOtpEmail, welcomeEmail } = require("../utils/emailTemplates");
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

    // A Google-created account has no password hash at all. Say so plainly:
    // "email or password is incorrect" would send them round in circles
    // trying to guess a password that was never set. This leaks only that
    // the address uses Google — which Google's own button already implies.
    if (!user.password) {
      throw ApiError.unauthorized(
        "This account signs in with Google. Use the “Continue with Google” button above.",
        { code: "USE_GOOGLE" }
      );
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
    const user = await User.findForOtp(email);

    const reply = {
      success: true,
      message: "If an account exists for that address, a reset code is on its way."
    };

    // A premature request is ignored rather than refused. Answering "wait 40
    // seconds" would confirm the address is registered, which is exactly what
    // the identical message above exists to prevent — so the caller sees the
    // same reply either way and their existing code simply stays valid.
    if (user && user.canIssueResetOtp()) {
      const code = user.createResetOtp();
      await user.save({ validateBeforeSave: false });

      // Console mode means no mail leaves the process, so the code is shown
      // locally to keep the flow testable. isDev() is an allowlist — an unset
      // or misspelled NODE_ENV counts as production and never leaks it.
      if (isDev() && mailMode() === "console") {
        console.log(`\n🔑  Password reset code (development only): ${code}\n`);
        reply.devResetCode = code;
      }

      // Fire-and-forget. Awaiting the SMTP round-trip would make responses for
      // registered addresses measurably slower than for unknown ones — the very
      // thing the identical message above exists to prevent.
      sendMail({
        to: user.email,
        ...resetOtpEmail({
          name: user.name,
          code,
          minutes: User.OTP_TTL_MINUTES,
          attempts: User.OTP_MAX_ATTEMPTS
        })
      }).catch((err) => console.warn("📧  Reset code email failed:", err.message));
    }

    res.json(reply);
  } catch (error) {
    next(error);
  }
}

/* ---------- POST /api/auth/verify-otp ---------- */

/**
 * Exchange a correct one-time code for the single-use token that actually
 * authorises the password change.
 *
 * Splitting it this way means the password-setting endpoint below never had
 * to change: it still takes a random 32-byte token, and the code is simply
 * how that token is now earned.
 */
async function verifyResetOtp(req, res, next) {
  try {
    const { email, code } = req.body;
    const user = await User.findForOtp(email);

    // One message for every failure — wrong code, expired code, no code, no
    // account. Distinguishing them would turn this into a way to discover
    // which addresses are registered, and telling an attacker how many
    // guesses remain would tell them exactly when to request a fresh code.
    const invalid = ApiError.badRequest(
      "That code is incorrect or has expired. Please request a new one.",
      { code: "OTP_INVALID" }
    );

    if (!user) {
      // Spend comparable time so a missing account is not detectably faster.
      crypto.createHash("sha256").update(String(code || "")).digest("hex");
      throw invalid;
    }

    const result = user.verifyResetOtp(code);

    // Saved on BOTH paths: a wrong guess has to be recorded, or the attempt
    // cap means nothing and the code can be walked through a million tries.
    if (!result.ok) {
      await user.save({ validateBeforeSave: false });
      throw invalid;
    }

    // Correct. Mint the token the reset endpoint expects.
    const token = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    res.json({
      success: true,
      message: "Code accepted. Choose a new password.",
      token
    });
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
        "This reset request is invalid or has expired. Please start again.",
        { code: "RESET_TOKEN_INVALID" }
      );
    }

    user.password = password;              // re-hashed by the pre-save hook
    user.passwordResetToken = null;        // single use
    user.passwordResetExpires = null;
    user.clearResetOtp();                  // nothing outstanding survives a reset
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

    // Nothing to compare against on a Google-only account. The reset flow
    // mails the same verified address, so it's a safe way to add a password.
    if (!user.password) {
      throw ApiError.badRequest(
        "This account signs in with Google and has no password yet. " +
        "Use “Forgot password” to set one.",
        { code: "NO_PASSWORD_SET" }
      );
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
  roleFor,                 // shared with the Google sign-in controller, so
                           // role policy has exactly one implementation
  register,
  login,
  logout,
  me,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
  changePassword
};
