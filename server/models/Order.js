/* =============================================================
   NovaCart — Order model
   -------------------------------------------------------------
   Stored in the "orders" collection.

   Line items store a SNAPSHOT of the product (name, image, unit
   price) rather than only a reference. An order is a historical
   record: if a product is renamed, repriced or deleted next week,
   what the customer actually bought must not change with it.
   ============================================================= */

const mongoose = require("mongoose");
const { PAYMENT_METHODS, PAYMENT_STATUSES } = require("../config/payment");

const STATUSES = ["pending", "processing", "shipped", "delivered", "cancelled"];

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", default: null },
    productId: { type: Number, required: true },      // numeric id, for links
    colorId: { type: String, default: null },
    colorLabel: { type: String, default: "" },
    name: { type: String, required: true },
    image: { type: String, default: "" },
    unitPrice: { type: Number, required: true, min: 0 },
    qty: { type: Number, required: true, min: 1 }
  },
  { _id: false }
);

const timelineSchema = new mongoose.Schema(
  {
    status: { type: String, enum: STATUSES, required: true },
    at: { type: Date, default: Date.now },
    note: { type: String, default: "" },
    by: { type: String, default: "system" }           // "system" | admin email
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    number: {
      type: String,
      required: true,
      unique: true,
      index: true,
      uppercase: true,
      trim: true
    },

    // Null for a guest checkout; set when the buyer was signed in.
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true
    },

    customer: {
      name: { type: String, required: true, trim: true, maxlength: 80 },
      email: { type: String, required: true, trim: true, lowercase: true, index: true },
      phone: { type: String, required: true, trim: true, maxlength: 30 },
      address: { type: String, required: true, trim: true, maxlength: 200 },
      city: { type: String, required: true, trim: true, maxlength: 80 },
      postal: { type: String, required: true, trim: true, maxlength: 20 }
    },

    items: {
      type: [orderItemSchema],
      validate: {
        validator: (items) => Array.isArray(items) && items.length > 0,
        message: "An order needs at least one item"
      }
    },

    subtotal: { type: Number, required: true, min: 0 },
    shipping: { type: Number, required: true, min: 0, default: 0 },
    total: { type: Number, required: true, min: 0 },

    status: {
      type: String,
      enum: { values: STATUSES, message: "Unknown order status" },
      default: "pending",
      index: true
    },

    /* ---------- Payment ----------
       These four were read and written all over the payment controller but
       never declared here, and Mongoose in strict mode DROPS a write to a
       path it does not know. So create-intent set paymentRef, saved nothing,
       and verify then found no reference and refused to mark the order paid:
       a card could be charged and the order stay unpaid forever. The lists
       come from config/payment.js, which already claimed to be mirrored
       here.                                                                */

    paymentMethod: {
      type: String,
      enum: PAYMENT_METHODS,
      default: "cod"
    },

    paymentStatus: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: "unpaid",
      index: true
    },

    // Stripe's PaymentIntent id. Indexed because the webhook arrives knowing
    // only this, and has to find the order from it.
    paymentRef: { type: String, default: null, index: true },

    // Brand, last four, receipt url — never a card number, which this server
    // is never given and must never store.
    paymentDetails: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },

    paidAt: { type: Date, default: null },

    timeline: { type: [timelineSchema], default: [] },

    placedAt: { type: Date, default: Date.now, index: true }
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    }
  }
);

/** Units across all lines — the "12 items" figure in listings. */
orderSchema.virtual("itemCount").get(function itemCount() {
  return this.items.reduce((sum, line) => sum + line.qty, 0);
});

/**
 * Human-readable, reasonably unique: NC-XXXXXXX.
 * Collisions are still possible in theory, so createOrder retries.
 */
orderSchema.statics.generateNumber = function generateNumber() {
  const stamp = Date.now().toString(36).slice(-5).toUpperCase();
  const salt = Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, "0");
  return `NC-${stamp}${salt}`;
};

orderSchema.statics.STATUSES = STATUSES;

/** Which statuses may follow the current one. */
orderSchema.statics.nextStatuses = function nextStatuses(current) {
  const flow = {
    pending: ["processing", "cancelled"],
    processing: ["shipped", "cancelled"],
    shipped: ["delivered"],
    delivered: [],
    cancelled: []
  };
  return flow[current] || [];
};

module.exports = mongoose.model("Order", orderSchema);
