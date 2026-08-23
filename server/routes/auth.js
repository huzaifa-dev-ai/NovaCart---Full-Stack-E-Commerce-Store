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
  resetPassword,
  changePassword
} = require("../controllers/authController");

const {
  registerRules,
  loginRules,
  forgotPasswordRules,
  resetPasswordRules,
  changePasswordRules
} = require("../middleware/validate");

const { protect } = require("../middleware/auth");

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

/* ---------- Routes ---------- */

router.post("/register", registerLimiter, registerRules, register);
router.post("/login", loginLimiter, loginRules, login);
router.post("/logout", logout);
router.get("/me", protect, me);

router.post("/forgot-password", forgotLimiter, forgotPasswordRules, forgotPassword);
router.post("/reset-password", resetLimiter, resetPasswordRules, resetPassword);
router.patch("/password", protect, changePasswordRules, changePassword);

module.exports = router;
