/* =============================================================
   NovaCart — payment controller (Stripe Credit/Debit Card)
   -------------------------------------------------------------
   GET   /api/payments/config          publishable key + capability
   POST  /api/payments/create-intent   create a Stripe PaymentIntent
   POST  /api/payments/verify          confirm payment WITH Stripe
   POST  /api/payments/simulate        dev-only stand-in (no keys)
   POST  /api/payments/webhook         signed Stripe events

   THE RULE THIS FILE EXISTS TO ENFORCE:
   an order becomes "paid" only when Stripe says so. The browser is
   never believed about money. /verify re-fetches the PaymentIntent
   from Stripe's API and checks its status, its amount, and that it
   belongs to this order before a single field is written.
   ============================================================= */

const Order = require("../models/Order");
const ApiError = require("../utils/ApiError");
const { stripe } = require("../config/payment");
const { isDev } = require("../utils/env");

// Initialise the SDK once, only when a secret key is present.
let stripeSdk = null;
if (stripe.configured) {
  stripeSdk = require("stripe")(stripe.secretKey);
}

/**
 * Dev-only simulated payments, so the flow can be demoed without Stripe
 * keys. Never available in production, where it would amount to a public
 * "mark this order paid" button.
 */
function simulationAllowed() {
  return isDev() && !stripe.configured;
}

function centsOf(order) {
  return Math.round(order.total * 100);
}

/** The order must exist AND belong to the caller. */
async function loadOwnedOrder(req, orderId) {
  if (!orderId) {
    throw ApiError.badRequest("Order ID is required.", { code: "MISSING_ORDER" });
  }

  let order;
  try {
    order = await Order.findById(orderId);
  } catch (err) {
    throw ApiError.badRequest("That order id isn't valid.", { code: "BAD_ORDER_ID" });
  }
  if (!order) {
    throw ApiError.notFound("Order not found.", { code: "ORDER_NOT_FOUND" });
  }

  const isAdmin = req.user.role === "admin";
  const owns = (order.user && order.user.equals(req.user._id)) ||
               order.customer.email === req.user.email;

  if (!isAdmin && !owns) {
    // Same message as "missing", so this cannot be used to probe order ids.
    throw ApiError.notFound("Order not found.", { code: "ORDER_NOT_FOUND" });
  }
  return order;
}

/** Shared guards for anything that moves an order toward "paid". */
function assertPayable(order) {
  if (order.paymentMethod === "cod") {
    throw ApiError.badRequest("This order uses Cash on Delivery.", { code: "COD_ORDER" });
  }
  if (order.paymentStatus === "paid") {
    throw ApiError.badRequest("This order is already paid.", { code: "ALREADY_PAID" });
  }
  if (order.status === "cancelled") {
    throw ApiError.badRequest("This order was cancelled.", { code: "ORDER_CANCELLED" });
  }
}

/** One place that writes the paid state, so every path records it alike. */
function markPaid(order, details) {
  order.paymentStatus = "paid";
  order.paymentRef = details.intentId || order.paymentRef;
  order.paymentDetails = {
    cardBrand: details.cardBrand,
    last4: details.last4,
    paidAt: new Date(),
    simulated: details.simulated === true
  };
  order.timeline.push({ status: order.status, note: details.note, by: "system" });
}

/* ---------- GET /api/payments/config ---------- */

function getPaymentConfig(_req, res) {
  res.json({
    success: true,
    configured: stripe.configured,          // real Stripe available?
    simulation: simulationAllowed(),        // dev stand-in available?
    publishableKey: stripe.publishableKey,  // safe to expose by design
    currency: "usd"
  });
}

/* ---------- POST /api/payments/create-intent ---------- */

async function createPaymentIntent(req, res, next) {
  try {
    const order = await loadOwnedOrder(req, req.body.orderId);
    assertPayable(order);

    if (!stripeSdk) {
      if (!simulationAllowed()) {
        throw new ApiError(503, "Card payments are not available right now.", {
          code: "STRIPE_UNCONFIGURED"
        });
      }
      // Development stand-in. No client secret is issued, because there is
      // no Stripe payment to confirm — /simulate is the only way onward.
      order.paymentStatus = "pending";
      await order.save();
      return res.json({
        success: true,
        simulation: true,
        message: "Stripe keys are not configured — running the demo card flow."
      });
    }

    // The amount comes from the stored order, never from the request body.
    const paymentIntent = await stripeSdk.paymentIntents.create({
      amount: centsOf(order),
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata: {
        orderId: order.id,
        orderNumber: order.number,
        customerEmail: order.customer.email
      },
      receipt_email: order.customer.email
    });

    order.paymentRef = paymentIntent.id;
    order.paymentStatus = "pending";
    await order.save();

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (error) {
    next(error);
  }
}

/* ---------- POST /api/payments/verify ---------- */

/**
 * Called after the browser has confirmed the card with Stripe.
 *
 * The request is treated as a HINT that something happened, never as
 * proof. The PaymentIntent is re-fetched from Stripe and every claim is
 * checked against it, so a forged call marks nothing paid.
 */
async function verifyPayment(req, res, next) {
  try {
    const order = await loadOwnedOrder(req, req.body.orderId);
    assertPayable(order);

    if (!stripeSdk) {
      throw new ApiError(503, "Card payments are not available right now.", {
        code: "STRIPE_UNCONFIGURED"
      });
    }

    // Only the intent WE created for THIS order is acceptable — never an id
    // supplied by the caller.
    const intentId = order.paymentRef;
    if (!intentId) {
      throw ApiError.badRequest("No payment has been started for this order.", {
        code: "NO_INTENT"
      });
    }

    const intent = await stripeSdk.paymentIntents.retrieve(intentId, {
      expand: ["latest_charge"]
    });

    // Belt and braces: the intent must point back at this order, and the
    // amount must match what we stored.
    if (intent.metadata && intent.metadata.orderId && intent.metadata.orderId !== order.id) {
      throw ApiError.badRequest("That payment belongs to a different order.", {
        code: "INTENT_MISMATCH"
      });
    }
    if (intent.amount !== centsOf(order)) {
      throw ApiError.badRequest("Payment amount does not match the order total.", {
        code: "AMOUNT_MISMATCH"
      });
    }

    if (intent.status !== "succeeded") {
      order.paymentStatus = intent.status === "processing" ? "pending" : "failed";
      await order.save();
      throw ApiError.badRequest(
        intent.status === "processing"
          ? "Your payment is still processing. We'll email you once it clears."
          : "That payment was not completed. Please try another card.",
        { code: "PAYMENT_NOT_SUCCEEDED" }
      );
    }

    // Card details come from Stripe's record, not from the browser.
    const charge = intent.latest_charge || {};
    const card = (charge.payment_method_details && charge.payment_method_details.card) || {};

    markPaid(order, {
      cardBrand: card.brand || "card",
      last4: card.last4 || "",
      intentId: intent.id,
      note: "Paid via " + (card.brand || "card") + (card.last4 ? " ending in " + card.last4 : "")
    });
    await order.save();

    res.json({ success: true, order });
  } catch (error) {
    next(error);
  }
}

/* ---------- POST /api/payments/simulate  (development only) ---------- */

async function simulatePayment(req, res, next) {
  try {
    if (!simulationAllowed()) {
      throw ApiError.forbidden(
        "Simulated payments are disabled. Configure Stripe keys to take card payments.",
        { code: "SIMULATION_DISABLED" }
      );
    }

    const order = await loadOwnedOrder(req, req.body.orderId);
    assertPayable(order);

    markPaid(order, {
      cardBrand: "simulated",
      last4: "0000",
      intentId: "sim_" + Date.now().toString(36),
      note: "Payment simulated (development mode — no money moved)",
      simulated: true
    });
    await order.save();

    res.json({ success: true, simulated: true, order });
  } catch (error) {
    next(error);
  }
}

/* ---------- POST /api/payments/webhook ---------- */

async function stripeWebhook(req, res) {
  // Signature verification is MANDATORY. Without it this endpoint is a
  // public "mark any order paid" button, so a missing secret must fail
  // closed rather than fall back to trusting the request body.
  if (!stripeSdk || !stripe.webhookSecret) {
    console.error("⚠️   Webhook rejected: STRIPE_WEBHOOK_SECRET is not configured.");
    return res.status(503).json({ error: "Webhooks are not configured." });
  }

  let event;
  try {
    event = stripeSdk.webhooks.constructEvent(
      req.body,                                  // raw Buffer, via express.raw
      req.headers["stripe-signature"],
      stripe.webhookSecret
    );
  } catch (err) {
    console.error("⚠️   Webhook signature verification failed:", err.message);
    return res.status(400).send("Webhook Error: " + err.message);
  }

  try {
    const intent = event.data.object;
    const orderId = intent.metadata ? intent.metadata.orderId : null;
    const order = orderId
      ? await Order.findById(orderId).catch(() => null)
      : await Order.findOne({ paymentRef: intent.id });

    if (order && event.type === "payment_intent.succeeded") {
      // Idempotent: Stripe retries, and the amount is checked even here.
      if (order.paymentStatus !== "paid" && intent.amount === centsOf(order)) {
        const charge = intent.charges && intent.charges.data ? intent.charges.data[0] : null;
        const card = (charge && charge.payment_method_details && charge.payment_method_details.card) || {};
        markPaid(order, {
          cardBrand: card.brand || "card",
          last4: card.last4 || "",
          intentId: intent.id,
          note: "Payment confirmed by Stripe (" + intent.id + ")"
        });
        await order.save();
      }
    } else if (order && event.type === "payment_intent.payment_failed") {
      order.paymentStatus = "failed";
      order.timeline.push({
        status: order.status,
        note: "Payment failed: " + (intent.last_payment_error ? intent.last_payment_error.message : "unknown error"),
        by: "system"
      });
      await order.save();
    }
  } catch (err) {
    // Stripe retries on non-2xx; log and accept so it doesn't loop forever
    // on a bug of ours.
    console.error("⚠️   Webhook handling error:", err.message);
  }

  res.json({ received: true });
}

module.exports = {
  getPaymentConfig,
  createPaymentIntent,
  verifyPayment,
  simulatePayment,
  stripeWebhook
};
