/* =============================================================
   NovaCart — payment gateway configuration
   -------------------------------------------------------------
   Configures Stripe Credit/Debit Card payments and Cash on Delivery.
   Reads STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY from env.

   All secrets stay server-side; the frontend receives only the
   publishable key for mounting Stripe Elements.
   ============================================================= */

const stripe = {
  secretKey: process.env.STRIPE_SECRET_KEY || "",
  publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || "",
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  get configured() {
    return !!this.secretKey;
  }
};

/** The payment methods the store currently supports. */
const PAYMENT_METHODS = ["cod", "card"];

/** Valid payment status values (mirrored in Order schema). */
const PAYMENT_STATUSES = ["unpaid", "pending", "paid", "failed", "refunded"];

module.exports = { stripe, PAYMENT_METHODS, PAYMENT_STATUSES };
