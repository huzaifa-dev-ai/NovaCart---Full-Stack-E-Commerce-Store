/* =============================================================
   NovaCart — return controller
   -------------------------------------------------------------
   POST  /api/returns          request a return (customer)
   GET   /api/returns/mine     the customer's own requests
   GET   /api/returns          every request          [admin]
   PATCH /api/returns/:id      approve/reject/refund  [admin]
   ============================================================= */

const Return = require("../models/Return");
const Order = require("../models/Order");
const Product = require("../models/Product");
const ApiError = require("../utils/ApiError");
const { sendMail } = require("../utils/mailer");
const { returnStatusEmail } = require("../utils/emailTemplates");

function money(value) {
  return Math.round(value * 100) / 100;
}

/* ---------- POST /api/returns ---------- */

async function requestReturn(req, res, next) {
  try {
    const { orderNumber, items, reason } = req.body;

    const order = await Order.findOne({ number: String(orderNumber || "").toUpperCase() });
    if (!order) {
      throw ApiError.notFound("We couldn't find that order.", { code: "ORDER_NOT_FOUND" });
    }

    // Owner check — same rule as viewing an order.
    const isOwner = (order.user && order.user.equals(req.user._id)) ||
                    order.customer.email === req.user.email;
    if (!isOwner && req.user.role !== "admin") {
      throw ApiError.notFound("We couldn't find that order.", { code: "ORDER_NOT_FOUND" });
    }

    const eligibility = Return.checkEligibility(order);
    if (!eligibility.ok) {
      throw ApiError.badRequest(eligibility.reason, { code: "NOT_ELIGIBLE" });
    }

    // One open request per order keeps the queue unambiguous.
    const open = await Return.findOne({
      order: order._id,
      status: { $in: ["requested", "approved"] }
    });
    if (open) {
      throw ApiError.conflict(
        `There is already an open return (${open.reference}) for this order.`,
        { code: "RETURN_EXISTS" }
      );
    }

    // Only lines that are on the order, never more than were bought, and
    // never more than is still outstanding after earlier returns.
    //
    // Duplicates used to be pushed straight through: sending the same line
    // three times was checked three times INDIVIDUALLY against what was
    // bought, and all three passed. A single item bought once came back as
    // three refundable lines. Quantities are accumulated per line first and
    // the TOTAL is what gets checked.
    //
    // Lines are keyed by product AND colour, because an order can hold the
    // same product twice in two colours and matching on product alone would
    // confuse them.
    const keyOf = (productId, colorId) => `${productId}::${colorId || ""}`;
    const orderLines = new Map(order.items.map((line) => [keyOf(line.productId, line.colorId), line]));

    // What earlier returns already claimed, so the same goods cannot be
    // refunded twice over several requests.
    const settled = await Return.find({
      order: order._id,
      status: { $in: ["requested", "approved", "refunded"] }
    }).lean();
    const alreadyClaimed = new Map();
    settled.forEach((prev) => {
      (prev.items || []).forEach((l) => {
        const k = keyOf(l.productId, l.colorId);
        alreadyClaimed.set(k, (alreadyClaimed.get(k) || 0) + (Number(l.qty) || 0));
      });
    });

    const wanted = new Map();
    for (const entry of Array.isArray(items) ? items : []) {
      const productId = Number(entry.productId ?? entry.id);
      const colorId = entry.colorId ? String(entry.colorId).trim() : null;
      const k = keyOf(productId, colorId);
      const line = orderLines.get(k);
      if (!line) {
        throw ApiError.badRequest("One of those items isn't on this order.", {
          code: "ITEM_NOT_ON_ORDER"
        });
      }
      const qty = Math.floor(Number(entry.qty)) || line.qty;
      if (qty < 1) {
        throw ApiError.badRequest(
          `You can return between 1 and ${line.qty} of ${line.name}.`,
          { code: "BAD_QTY" }
        );
      }
      wanted.set(k, { line, qty: (wanted.get(k) ? wanted.get(k).qty : 0) + qty });
    }

    const requested = [];
    for (const [k, { line, qty }] of wanted.entries()) {
      const remaining = line.qty - (alreadyClaimed.get(k) || 0);
      if (remaining <= 0) {
        throw ApiError.badRequest(
          `${line.name} has already been returned on this order.`,
          { code: "ALREADY_RETURNED" }
        );
      }
      if (qty > remaining) {
        throw ApiError.badRequest(
          `You can return between 1 and ${remaining} of ${line.name}.`,
          { code: "BAD_QTY" }
        );
      }
      requested.push({
        productId: line.productId,
        colorId: line.colorId || null,
        name: line.name,
        qty,
        unitPrice: line.unitPrice
      });
    }

    // No items given means "return the whole order".
    const finalItems = requested.length
      ? requested
      // "the whole order" means whatever has not already come back.
      : order.items
          .map((l) => ({
            productId: l.productId,
            colorId: l.colorId || null,
            name: l.name,
            qty: l.qty - (alreadyClaimed.get(keyOf(l.productId, l.colorId)) || 0),
            unitPrice: l.unitPrice
          }))
          .filter((l) => l.qty > 0);

    if (!finalItems.length) {
      throw ApiError.badRequest(
        "Everything on this order has already been returned.",
        { code: "ALREADY_RETURNED" }
      );
    }

    let created = null;
    for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
      try {
        created = await Return.create({
          reference: Return.generateReference(),
          order: order._id,
          orderNumber: order.number,
          user: req.user._id,
          customerEmail: order.customer.email,
          items: finalItems,
          reason: String(reason || "").trim(),
          status: "requested"
        });
      } catch (error) {
        if (error.code === 11000 && attempt < 4) { continue; }
        throw error;
      }
    }

    res.status(201).json({ success: true, return: created });
  } catch (error) {
    next(error);
  }
}

/* ---------- GET /api/returns/mine ---------- */

async function myReturns(req, res, next) {
  try {
    const returns = await Return.find({
      $or: [{ user: req.user._id }, { customerEmail: req.user.email }]
    }).sort({ createdAt: -1 }).limit(100);

    res.json({ success: true, count: returns.length, returns });
  } catch (error) {
    next(error);
  }
}

/* ---------- GET /api/returns  [admin] ---------- */

async function listReturns(req, res, next) {
  try {
    const { status, search } = req.query;
    const filter = {};

    if (status && Return.STATUSES.includes(status)) { filter.status = status; }

    if (search && String(search).trim()) {
      const safe = String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(safe, "i");
      filter.$or = [{ reference: rx }, { orderNumber: rx }, { customerEmail: rx }];
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));

    const [returns, total] = await Promise.all([
      Return.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      Return.countDocuments(filter)
    ]);

    res.json({
      success: true,
      count: returns.length,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      returns
    });
  } catch (error) {
    next(error);
  }
}

/* ---------- PATCH /api/returns/:id  [admin] ---------- */

async function updateReturn(req, res, next) {
  try {
    const { status, adminNote, refundAmount, restock } = req.body;

    if (!["approved", "rejected", "refunded"].includes(status)) {
      throw ApiError.badRequest(
        "Status must be approved, rejected or refunded.",
        { code: "BAD_STATUS" }
      );
    }

    const request = await Return.findById(req.params.id);
    if (!request) {
      throw ApiError.notFound("We couldn't find that return.", { code: "RETURN_NOT_FOUND" });
    }

    if (["rejected", "refunded"].includes(request.status)) {
      throw ApiError.badRequest(
        `This return is already ${request.status} and cannot be changed.`,
        { code: "RETURN_FINAL" }
      );
    }
    if (status === "refunded" && request.status !== "approved") {
      throw ApiError.badRequest(
        "A return has to be approved before it can be refunded.",
        { code: "BAD_TRANSITION" }
      );
    }

    if (status === "refunded") {
      // The amount is settled BEFORE anything goes back on the shelf. It used
      // to be the other way round, so a refund rejected for a bad amount had
      // already restocked the goods - inventory created out of nothing, every
      // time an admin fat-fingered the figure.
      const requestedValue = request.items.reduce((s, l) => s + l.unitPrice * l.qty, 0);
      const amount = refundAmount === undefined ? requestedValue : Number(refundAmount);
      if (!Number.isFinite(amount) || amount < 0 || amount > requestedValue + 0.01) {
        throw ApiError.badRequest(
          `Refund must be between $0 and $${money(requestedValue).toFixed(2)}.`,
          { code: "BAD_REFUND" }
        );
      }
      request.refundAmount = money(amount);

      // Only now, with the amount accepted, do the goods return to the shelf.
      //
      // To the COLOUR they came off, as well as the product total. Crediting
      // only the total left the per-colour counts - which is what the product
      // page shows and what createOrder validates against - permanently short
      // of every unit ever returned.
      if (restock !== false) {
        for (const line of request.items) {
          if (line.colorId) {
            await Product.updateOne(
              { id: line.productId, "colors.id": line.colorId },
              {
                $inc: { stock: line.qty, "colors.$.stockCount": line.qty },
                $set: { "colors.$.inStock": true }
              }
            );
          } else {
            await Product.updateOne({ id: line.productId }, { $inc: { stock: line.qty } });
          }
        }
      }
    }

    request.status = status;
    request.adminNote = String(adminNote || "").slice(0, 1000);
    request.resolvedAt = new Date();
    request.resolvedBy = req.user.email;
    await request.save();

    res.json({ success: true, return: request });

    sendMail({ to: request.customerEmail, ...returnStatusEmail({ request }) })
      .catch((err) => console.warn("📧  Return status email failed:", err.message));
  } catch (error) {
    next(error);
  }
}

module.exports = { requestReturn, myReturns, listReturns, updateReturn };
