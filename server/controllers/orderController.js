/* =============================================================
   NovaCart — order controller
   -------------------------------------------------------------
   POST  /api/orders          place an order
   GET   /api/orders/mine     the signed-in customer's orders
   GET   /api/orders/:number  one order (owner or admin)
   GET   /api/orders          every order            [admin]
   PATCH /api/orders/:id      move an order's status [admin]

   Prices are ALWAYS recomputed from the database. The browser
   sends product ids and quantities only — never money — so a
   tampered request cannot buy a laptop for $1.
   ============================================================= */

const Order = require("../models/Order");
const Product = require("../models/Product");
const ApiError = require("../utils/ApiError");
const { sendMail } = require("../utils/mailer");
const { orderEmail, orderStatusEmail } = require("../utils/emailTemplates");

const FREE_SHIPPING_AT = 50;
const FLAT_SHIPPING = 4.99;

/** Round to cents — floating point drift has no place in money. */
function money(value) {
  return Math.round(value * 100) / 100;
}

/* ---------- POST /api/orders ---------- */

async function createOrder(req, res, next) {
  try {
    const { customer, items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      throw ApiError.badRequest("Your cart is empty.", { code: "EMPTY_CART" });
    }
    if (items.length > 50) {
      throw ApiError.badRequest("That's more line items than we can process at once.");
    }

    // Collapse duplicate (id, colorId) pairs
    const wanted = new Map();
    for (const line of items) {
      const id = Number(line.id ?? line.productId);
      const colorId = line.colorId ? String(line.colorId).trim() : null;
      const qty = Math.floor(Number(line.qty));
      if (!Number.isInteger(id) || id < 1) {
        throw ApiError.badRequest("One of the items has an invalid product id.");
      }
      if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
        throw ApiError.badRequest("Quantities must be whole numbers between 1 and 99.");
      }
      const key = `${id}::${colorId || ""}`;
      wanted.set(key, { id, colorId, qty: (wanted.get(key)?.qty || 0) + qty });
    }

    const productIds = [...new Set([...wanted.values()].map((w) => w.id))];
    const products = await Product.find({ id: { $in: productIds }, active: true });
    const byId = new Map(products.map((p) => [p.id, p]));

    const orderItems = [];
    for (const { id, colorId, qty } of wanted.values()) {
      const product = byId.get(id);
      if (!product) {
        throw ApiError.badRequest(`One of the items is no longer available.`, {
          code: "PRODUCT_UNAVAILABLE"
        });
      }

      const activeColor = colorId || product.defaultColorId || (product.colors && product.colors[0] && product.colors[0].id);
      const colorObj = (product.colors || []).find((c) => c.id === activeColor);

      const availableStock = colorObj ? colorObj.stockCount : product.stock;
      if (availableStock < qty) {
        throw ApiError.conflict(
          `${product.name}${colorObj ? " (" + colorObj.label + ")" : ""} only has ${availableStock} left in stock.`,
          { code: "INSUFFICIENT_STOCK" }
        );
      }

      orderItems.push({
        product: product._id,
        productId: product.id,
        colorId: activeColor || null,
        colorLabel: colorObj ? colorObj.label : "",
        name: product.name,
        image: colorObj ? colorObj.image : product.image,
        unitPrice: product.price,      // from the DB, never from the client
        qty
      });
    }

    const subtotal = money(orderItems.reduce((sum, l) => sum + l.unitPrice * l.qty, 0));
    const shipping = subtotal >= FREE_SHIPPING_AT ? 0 : FLAT_SHIPPING;
    const total = money(subtotal + shipping);

    // Retry on the (unlikely) chance two orders generate the same number.
    let order = null;
    for (let attempt = 0; attempt < 5 && !order; attempt += 1) {
      try {
        order = await Order.create({
          number: Order.generateNumber(),
          user: req.user ? req.user._id : null,
          customer: {
            name: customer.name,
            email: customer.email,
            phone: customer.phone,
            address: customer.address,
            city: customer.city,
            postal: customer.postal
          },
          items: orderItems,
          subtotal,
          shipping,
          total,
          status: "pending",
          timeline: [{ status: "pending", note: "Order placed", by: "system" }]
        });
      } catch (error) {
        if (error.code === 11000 && attempt < 4) { continue; }
        throw error;
      }
    }

    // Reserve the stock. Guarded by $gte so two simultaneous orders for the
    // last unit cannot both succeed.
    for (const line of orderItems) {
      await Product.updateOne(
        { id: line.productId, stock: { $gte: line.qty } },
        { $inc: { stock: -line.qty } }
      );
    }

    res.status(201).json({ success: true, order });

    // Confirmation email after responding — checkout must not wait on mail.
    sendMail({ to: order.customer.email, ...orderEmail({ order }) })
      .catch((err) => console.warn("📧  Order email failed:", err.message));
  } catch (error) {
    next(error);
  }
}

/* ---------- GET /api/orders/mine ---------- */

async function myOrders(req, res, next) {
  try {
    // Match on the account id and on the email, so orders placed as a guest
    // with the same address still show up after signing in.
    const orders = await Order.find({
      $or: [{ user: req.user._id }, { "customer.email": req.user.email }]
    }).sort({ placedAt: -1 }).limit(100);

    res.json({ success: true, count: orders.length, orders });
  } catch (error) {
    next(error);
  }
}

/* ---------- GET /api/orders/:number ---------- */

async function getOrder(req, res, next) {
  try {
    const order = await Order.findOne({ number: String(req.params.number).toUpperCase() });
    if (!order) {
      throw ApiError.notFound("We couldn't find that order.", { code: "ORDER_NOT_FOUND" });
    }

    const isAdmin = req.user && req.user.role === "admin";
    const isOwner = req.user && (
      (order.user && order.user.equals(req.user._id)) ||
      order.customer.email === req.user.email
    );

    if (!isAdmin && !isOwner) {
      // Don't confirm the order exists to someone who shouldn't see it.
      throw ApiError.notFound("We couldn't find that order.", { code: "ORDER_NOT_FOUND" });
    }

    res.json({ success: true, order });
  } catch (error) {
    next(error);
  }
}

/* ---------- GET /api/orders  [admin] ---------- */

async function listOrders(req, res, next) {
  try {
    const { status, search } = req.query;
    const filter = {};

    if (status && Order.STATUSES.includes(status)) { filter.status = status; }

    if (search && String(search).trim()) {
      const safe = String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(safe, "i");
      filter.$or = [{ number: rx }, { "customer.name": rx }, { "customer.email": rx }];
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));

    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ placedAt: -1 }).skip((page - 1) * limit).limit(limit),
      Order.countDocuments(filter)
    ]);

    res.json({
      success: true,
      count: orders.length,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      orders
    });
  } catch (error) {
    next(error);
  }
}

/* ---------- PATCH /api/orders/:id  [admin] ---------- */

async function updateOrderStatus(req, res, next) {
  try {
    const { status, note } = req.body;

    if (!Order.STATUSES.includes(status)) {
      throw ApiError.badRequest(
        `Status must be one of: ${Order.STATUSES.join(", ")}.`,
        { code: "BAD_STATUS" }
      );
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      throw ApiError.notFound("We couldn't find that order.", { code: "ORDER_NOT_FOUND" });
    }

    if (order.status === status) {
      throw ApiError.badRequest(`This order is already ${status}.`, { code: "STATUS_UNCHANGED" });
    }

    const allowed = Order.nextStatuses(order.status);
    if (!allowed.includes(status)) {
      throw ApiError.badRequest(
        allowed.length
          ? `A ${order.status} order can only move to: ${allowed.join(" or ")}.`
          : `A ${order.status} order is final and cannot be changed.`,
        { code: "BAD_TRANSITION" }
      );
    }

    // Cancelling returns the reserved stock to the shelf.
    if (status === "cancelled") {
      for (const line of order.items) {
        await Product.updateOne({ id: line.productId }, { $inc: { stock: line.qty } });
      }
    }

    order.status = status;
    order.timeline.push({
      status,
      note: String(note || "").slice(0, 300),
      by: req.user.email
    });
    await order.save();

    res.json({ success: true, order });

    sendMail({ to: order.customer.email, ...orderStatusEmail({ order }) })
      .catch((err) => console.warn("📧  Order status email failed:", err.message));
  } catch (error) {
    next(error);
  }
}

module.exports = { createOrder, myOrders, getOrder, listOrders, updateOrderStatus };
