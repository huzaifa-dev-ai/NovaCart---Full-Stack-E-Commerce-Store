/* =============================================================
   NovaCart — payment routes  (mounted at /api/payments)
   -------------------------------------------------------------
   GET   /api/payments/config          publishable key (public)
   POST  /api/payments/create-intent   start a payment    [signed in]
   POST  /api/payments/verify          confirm via Stripe [signed in]
   POST  /api/payments/simulate        dev-only stand-in  [signed in]
   POST  /api/payments/webhook         Stripe events (signature-verified)

   Everything that can move an order toward "paid" requires a signed-in
   OWNER — `protect`, not `attachUser`. The optional variant would let a
   stranger act on somebody else's order.
   ============================================================= */

const express = require("express");
const rateLimit = require("express-rate-limit");

const {
  getPaymentConfig,
  createPaymentIntent,
  verifyPayment,
  simulatePayment,
  stripeWebhook
} = require("../controllers/paymentController");
const { protect } = require("../middleware/auth");

const router = express.Router();

// Payment endpoints are a card-testing target; keep attempts bounded.
const payLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many payment attempts. Please wait a few minutes.",
    code: "RATE_LIMITED"
  }
});

router.get("/config", getPaymentConfig);

router.post("/create-intent", payLimiter, protect, createPaymentIntent);
router.post("/verify", payLimiter, protect, verifyPayment);
router.post("/simulate", payLimiter, protect, simulatePayment);

// Raw body required for signature verification.
router.post("/webhook", express.raw({ type: "application/json" }), stripeWebhook);

module.exports = router;
