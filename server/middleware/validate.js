/* =============================================================
   NovaCart — request validation
   -------------------------------------------------------------
   express-validator rule sets plus a runner that turns failures
   into a 422 with per-field messages the frontend can render
   next to the offending input.
   ============================================================= */

const { body, validationResult } = require("express-validator");
const ApiError = require("../utils/ApiError");

/** Stops the request if any rule failed. */
function runValidation(req, _res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) { return next(); }

  const errors = result.array().map((e) => ({
    field: e.path,
    message: e.msg
  }));

  return next(ApiError.validation("Please check the highlighted fields.", errors));
}

/* ---------- Shared field rules ---------- */

const emailRule = body("email")
  .trim()
  .notEmpty().withMessage("Email is required")
  .bail()
  .isEmail().withMessage("Please enter a valid email address")
  .bail()
  .isLength({ max: 254 }).withMessage("Email is too long")
  // keeps storage consistent so duplicates can't slip in via casing
  .normalizeEmail({ gmail_remove_dots: false, all_lowercase: true });

const passwordRule = body("password")
  .notEmpty().withMessage("Password is required")
  .bail()
  .isLength({ min: 8 }).withMessage("Password must be at least 8 characters")
  .bail()
  .isLength({ max: 128 }).withMessage("Password must be 128 characters or fewer")
  .bail()
  .matches(/[A-Za-z]/).withMessage("Password must contain at least one letter")
  .bail()
  .matches(/\d/).withMessage("Password must contain at least one number");

/* ---------- Rule sets ---------- */

const registerRules = [
  body("name")
    .trim()
    .notEmpty().withMessage("Name is required")
    .bail()
    .isLength({ min: 2, max: 60 }).withMessage("Name must be between 2 and 60 characters")
    .bail()
    .matches(/^[\p{L}\p{M}'.\- ]+$/u).withMessage("Name can only contain letters, spaces, hyphens and apostrophes"),
  emailRule,
  passwordRule,
  runValidation
];

const loginRules = [
  body("email")
    .trim()
    .notEmpty().withMessage("Email is required")
    .bail()
    .isEmail().withMessage("Please enter a valid email address")
    .normalizeEmail({ gmail_remove_dots: false, all_lowercase: true }),
  // Deliberately loose: an old account might predate the current policy,
  // and rejecting on format here would leak which passwords are valid shapes.
  body("password")
    .notEmpty().withMessage("Password is required")
    .bail()
    .isLength({ max: 128 }).withMessage("Password is too long"),
  runValidation
];

const forgotPasswordRules = [emailRule, runValidation];

const verifyOtpRules = [
  emailRule,
  body("code")
    .trim()
    .notEmpty().withMessage("Enter the code from your email")
    .bail()
    // Exactly six digits — anything else cannot be one of ours, so it is
    // rejected before it reaches the attempt counter.
    .matches(/^[0-9]{6}$/).withMessage("The code is 6 digits"),
  runValidation
];

const resetPasswordRules = [
  body("token")
    .trim()
    .notEmpty().withMessage("Reset token is missing")
    .bail()
    .isLength({ min: 32, max: 128 }).withMessage("Reset token is not valid")
    .bail()
    .matches(/^[a-f0-9]+$/i).withMessage("Reset token is not valid"),
  passwordRule,
  runValidation
];

const changePasswordRules = [
  body("currentPassword")
    .notEmpty().withMessage("Your current password is required")
    .bail()
    .isLength({ max: 128 }).withMessage("Password is too long"),
  body("newPassword")
    .notEmpty().withMessage("A new password is required")
    .bail()
    .isLength({ min: 8 }).withMessage("Password must be at least 8 characters")
    .bail()
    .isLength({ max: 128 }).withMessage("Password must be 128 characters or fewer")
    .bail()
    .matches(/[A-Za-z]/).withMessage("Password must contain at least one letter")
    .bail()
    .matches(/\d/).withMessage("Password must contain at least one number"),
  runValidation
];

/* ---------- Checkout ---------- */

const checkoutRules = [
  body("customer.name")
    .trim().notEmpty().withMessage("Full name is required")
    .bail().isLength({ min: 3, max: 80 }).withMessage("Name must be between 3 and 80 characters"),
  body("customer.email")
    .trim().notEmpty().withMessage("Email is required")
    .bail().isEmail().withMessage("Please enter a valid email address")
    .normalizeEmail({ gmail_remove_dots: false, all_lowercase: true }),
  body("customer.phone")
    .trim().notEmpty().withMessage("Phone number is required")
    .bail().matches(/^[+]?[\d\s()-]{7,20}$/).withMessage("Please enter a valid phone number"),
  body("customer.address")
    .trim().isLength({ min: 5, max: 200 }).withMessage("Address must be between 5 and 200 characters"),
  body("customer.city")
    .trim().isLength({ min: 2, max: 80 }).withMessage("City is required"),
  body("customer.postal")
    .trim().matches(/^[A-Za-z0-9][A-Za-z0-9\s-]{2,19}$/).withMessage("Please enter a valid postal code"),
  body("items")
    .isArray({ min: 1, max: 50 }).withMessage("Your cart is empty"),
  body("paymentMethod")
    .optional()
    .trim()
    .isIn(["cod", "card"]).withMessage("Please choose a valid payment method"),
  runValidation
];

/* ---------- Returns ---------- */

const returnRules = [
  body("orderNumber")
    .trim().notEmpty().withMessage("Order number is required")
    .bail().matches(/^NC-[A-Z0-9]{4,12}$/i).withMessage("That doesn't look like a NovaCart order number"),
  body("reason")
    .trim().isLength({ min: 10, max: 1000 })
    .withMessage("Please tell us why you're returning this (at least 10 characters)"),
  body("items").optional().isArray({ max: 50 }).withMessage("Too many items"),
  runValidation
];

/* ---------- Products (admin) ---------- */

const productFieldRules = (optional) => {
  const maybe = (chain) => (optional ? chain.optional() : chain);
  return [
    maybe(body("name").trim().notEmpty().withMessage("Product name is required"))
      .bail().isLength({ max: 120 }).withMessage("Name must be 120 characters or fewer"),
    maybe(body("category").trim().notEmpty().withMessage("Category is required"))
      .bail().isLength({ max: 60 }).withMessage("Category must be 60 characters or fewer"),
    maybe(body("price").notEmpty().withMessage("Price is required"))
      .bail().isFloat({ min: 0, max: 1000000 }).withMessage("Price must be a positive number"),
    maybe(body("image").trim().notEmpty().withMessage("Image path is required")),
    maybe(body("shortDescription").trim().notEmpty().withMessage("Short description is required"))
      .bail().isLength({ max: 200 }).withMessage("Short description must be 200 characters or fewer"),
    maybe(body("stock").notEmpty().withMessage("Stock level is required"))
      .bail().isInt({ min: 0, max: 100000 }).withMessage("Stock must be a whole number"),
    body("oldPrice").optional({ nullable: true, checkFalsy: true })
      .isFloat({ min: 0 }).withMessage("Old price must be a positive number"),
    body("description").optional().isLength({ max: 2000 })
      .withMessage("Description must be 2000 characters or fewer"),
    body("rating").optional().isFloat({ min: 0, max: 5 }).withMessage("Rating must be between 0 and 5"),
    body("reviews").optional().isInt({ min: 0 }).withMessage("Review count must be a whole number"),
    body("badge").optional({ nullable: true, checkFalsy: true })
      .isIn(["Sale", "New"]).withMessage("Badge must be Sale or New"),
    runValidation
  ];
};

const productRules = productFieldRules(false);
const productUpdateRules = productFieldRules(true);

module.exports = {
  runValidation,
  registerRules,
  loginRules,
  forgotPasswordRules,
  verifyOtpRules,
  resetPasswordRules,
  changePasswordRules,
  checkoutRules,
  returnRules,
  productRules,
  productUpdateRules
};
