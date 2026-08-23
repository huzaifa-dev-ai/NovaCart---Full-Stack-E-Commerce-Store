/* =============================================================
   NovaCart — Return model
   -------------------------------------------------------------
   A return request against a delivered order. Stored in the
   "returns" collection.

   The 30-day window from the returns policy is enforced here at
   creation time, so the rule the help page advertises is the rule
   the system actually applies.
   ============================================================= */

const mongoose = require("mongoose");

const STATUSES = ["requested", "approved", "rejected", "refunded"];

const RETURN_WINDOW_DAYS = 30;

const returnItemSchema = new mongoose.Schema(
  {
    productId: { type: Number, required: true },
    name: { type: String, required: true },
    qty: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 }
  },
  { _id: false }
);

const returnSchema = new mongoose.Schema(
  {
    reference: {
      type: String,
      required: true,
      unique: true,
      index: true,
      uppercase: true,
      trim: true
    },

    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true
    },
    orderNumber: { type: String, required: true, uppercase: true, trim: true },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true
    },
    customerEmail: { type: String, required: true, lowercase: true, trim: true, index: true },

    items: {
      type: [returnItemSchema],
      validate: {
        validator: (items) => Array.isArray(items) && items.length > 0,
        message: "A return needs at least one item"
      }
    },

    reason: {
      type: String,
      required: [true, "Please tell us why you're returning this"],
      trim: true,
      minlength: [10, "Please give us a little more detail"],
      maxlength: [1000, "Reason must be 1000 characters or fewer"]
    },

    status: {
      type: String,
      enum: { values: STATUSES, message: "Unknown return status" },
      default: "requested",
      index: true
    },

    // Filled in by an admin when approving/rejecting/refunding.
    adminNote: { type: String, default: "", trim: true, maxlength: 1000 },
    refundAmount: { type: Number, default: 0, min: 0 },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: String, default: "" }
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

/** Value of the requested items, used as the default refund. */
returnSchema.virtual("requestedValue").get(function requestedValue() {
  return this.items.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);
});

returnSchema.statics.generateReference = function generateReference() {
  const stamp = Date.now().toString(36).slice(-5).toUpperCase();
  const salt = Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, "0");
  return `RT-${stamp}${salt}`;
};

returnSchema.statics.STATUSES = STATUSES;
returnSchema.statics.RETURN_WINDOW_DAYS = RETURN_WINDOW_DAYS;

/**
 * Is this order still inside the returns window?
 * @param {Object} order
 * @returns {{ok: boolean, reason?: string}}
 */
returnSchema.statics.checkEligibility = function checkEligibility(order) {
  if (!order) { return { ok: false, reason: "That order could not be found." }; }

  if (order.status === "cancelled") {
    return { ok: false, reason: "This order was cancelled, so there is nothing to return." };
  }
  if (order.status !== "delivered") {
    return { ok: false, reason: "Returns can only be started once an order has been delivered." };
  }

  const deliveredEntry = [...(order.timeline || [])].reverse()
    .find((entry) => entry.status === "delivered");
  const deliveredAt = deliveredEntry ? deliveredEntry.at : order.placedAt;

  const ageDays = (Date.now() - new Date(deliveredAt).getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays > RETURN_WINDOW_DAYS) {
    return {
      ok: false,
      reason: `Our returns window is ${RETURN_WINDOW_DAYS} days, and this order was delivered ${Math.floor(ageDays)} days ago.`
    };
  }

  return { ok: true };
};

module.exports = mongoose.model("Return", returnSchema);
