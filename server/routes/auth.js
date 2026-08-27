/* =============================================================
   NovaCart — auth routes  (mounted at /api/auth)
   ============================================================= */

const express = require("express");
const rateLimit = require("express-rate-limit");

const {
  register,
  login,
  logout,
  me,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
  changePassword
} = require("../controllers/authController");

const {
  registerRules,
  loginRules,
  forgotPasswordRules,
  verifyOtpRules,
  resetPasswordRules,
  changePasswordRules
} = require("../middleware/validate");

const {
  googleStart,
  googleCallback,
  googleStatus
} = require("../controllers/googleAuthController");

const { protect, attachUser } = require("../middleware/auth");

const router = express.Router();

/* ---------- Rate limits ---------- */
// Password guessing is the realistic attack here, so login is the
// tightest bucket. Successful sign-ins don't count against it.

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many sign-in attempts. Please wait 15 minutes and try again.",
    code: "RATE_LIMITED"
  }
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many accounts created from this device. Please try again later.",
    code: "RATE_LIMITED"
  }
});

// Asking for a link sends mail and mints a token — keep that scarce.
const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many password reset requests. Please try again in an hour.",
    code: "RATE_LIMITED"
  }
});

// Guessing a 6-digit code is the attack this flow invites, so this is the
// tightest bucket in the file. It is the SECOND line of defence: the account
// itself only tolerates 5 wrong guesses before the code is destroyed. This
// one stops someone spreading guesses thinly across many accounts instead.
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many attempts. Please request a new code and try again shortly.",
    code: "RATE_LIMITED"
  }
});

// Completing a reset needs its own budget. Sharing one with the endpoint
// above would mean that asking for a few links could lock you out of
// actually using the last one — punishing the very people it protects.
// A valid single-use token is the real gate here; this only stops brute force.
const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many attempts. Please request a fresh reset link.",
    code: "RATE_LIMITED"
  }
});

// Starting an OAuth round trip is cheap for us but not free — it mints
// state and sends someone to Google. The callback is deliberately NOT
// limited: a legitimate user arrives there exactly once per attempt, and
// throttling it would break the tail end of a sign-in already in progress.
const oauthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  // This route is reached by top-level browser navigation, not fetch(), so
  // the default JSON body would be rendered to the visitor as raw text.
  // Send them back to the sign-in page with something it can display.
  handler: (_req, res) => res.redirect("/login.html?error=google_rate_limited")
});

/* ---------- Routes ---------- */

router.post("/register", registerLimiter, registerRules, register);
router.post("/login", loginLimiter, loginRules, login);
router.post("/logout", logout);
router.get("/me", protect, me);

/* Google Sign-In — browser navigation, not fetch(); see the controller. */
router.get("/google", oauthLimiter, googleStart);
// attachUser (not protect): the callback is public, but knowing whether the
// visitor is already signed in lets a link to an existing account be treated
// as deliberate rather than as a possible account takeover.
router.get("/google/callback", attachUser, googleCallback);
router.get("/google/status", googleStatus);

router.post("/forgot-password", forgotLimiter, forgotPasswordRules, forgotPassword);
router.post("/verify-otp", otpLimiter, verifyOtpRules, verifyResetOtp);
router.post("/reset-password", resetLimiter, resetPasswordRules, resetPassword);
router.patch("/password", protect, changePasswordRules, changePassword);

module.exports = router;
