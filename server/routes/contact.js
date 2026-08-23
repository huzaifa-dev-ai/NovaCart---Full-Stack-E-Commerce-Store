/* =============================================================
   NovaCart — contact form  (mounted at /api/contact)
   -------------------------------------------------------------
   POST /api/contact  { name, email, message }
   Delivers the message to the store inbox (CONTACT_TO, falling
   back to ADMIN_EMAIL) with Reply-To set to the sender, so
   answering is one click.
   ============================================================= */

const express = require("express");
const rateLimit = require("express-rate-limit");
const { body } = require("express-validator");

const ApiError = require("../utils/ApiError");
const { sendMail } = require("../utils/mailer");
const { contactEmail } = require("../utils/emailTemplates");
const { runValidation } = require("../middleware/validate");
const { isDev } = require("../utils/env");

const router = express.Router();

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    error: "You've sent quite a few messages — please try again in an hour.",
    code: "RATE_LIMITED"
  }
});

const contactRules = [
  body("name")
    .trim()
    .notEmpty().withMessage("Please tell us your name")
    .bail()
    .isLength({ min: 2, max: 60 }).withMessage("Name must be between 2 and 60 characters"),
  body("email")
    .trim()
    .notEmpty().withMessage("Email is required")
    .bail()
    .isEmail().withMessage("Please enter a valid email address")
    .normalizeEmail({ gmail_remove_dots: false, all_lowercase: true }),
  body("message")
    .trim()
    .isLength({ min: 10 }).withMessage("Give us a few more details (at least 10 characters)")
    .bail()
    .isLength({ max: 2000 }).withMessage("Message must be 2000 characters or fewer"),
  runValidation
];

router.post("/", contactLimiter, contactRules, async (req, res, next) => {
  try {
    const { name, email, message } = req.body;

    const inbox = process.env.CONTACT_TO || process.env.ADMIN_EMAIL;
    if (!inbox) {
      throw new Error("Neither CONTACT_TO nor ADMIN_EMAIL is set in .env");
    }

    const unavailable = () =>
      new ApiError(
        502,
        "We couldn't send your message right now. Please email us directly at " +
        (process.env.CONTACT_TO || process.env.ADMIN_EMAIL) + ".",
        { code: "MAIL_UNAVAILABLE" }
      );

    // Reply-To is the visitor, so replying from the inbox goes to them.
    let result;
    try {
      result = await sendMail({
        to: inbox,
        replyTo: `${name} <${email}>`,
        ...contactEmail({ name, email, message })
      });
    } catch (error) {
      // A configured transport that failed (SMTP down, bad credentials).
      // Surface it as a mail problem rather than a generic 500.
      console.error("📧  Contact form send failed:", error.message);
      throw unavailable();
    }

    // Fail CLOSED. Reporting success for a message that went nowhere loses
    // real customer enquiries, so only an explicit development environment
    // is allowed to do that.
    if (!result.delivered && !isDev()) {
      throw unavailable();
    }

    res.json({
      success: true,
      message: "Thanks for reaching out — we'll reply to your email within one business day."
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
