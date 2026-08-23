/* =============================================================
   NovaCart — admin controller
   -------------------------------------------------------------
   GET    /api/admin/stats        dashboard figures
   GET    /api/admin/users        list customers
   PATCH  /api/admin/users/:id    change a role
   DELETE /api/admin/users/:id    remove an account
   POST   /api/admin/products     create
   PATCH  /api/admin/products/:id update
   DELETE /api/admin/products/:id archive (or hard delete)

   Every route here sits behind protect + requireRole("admin").
   ============================================================= */

const User = require("../models/User");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Return = require("../models/Return");
const ApiError = require("../utils/ApiError");

/* ---------- GET /api/admin/stats ---------- */

async function getStats(_req, res, next) {
  try {
    const [
      products, activeProducts, outOfStock, lowStock,
      users, admins,
      orders, pendingOrders,
      returns, openReturns,
      revenueRows, recentOrders
    ] = await Promise.all([
      Product.countDocuments(),
      Product.countDocuments({ active: true }),
      Product.countDocuments({ active: true, stock: 0 }),
      Product.countDocuments({ active: true, stock: { $gt: 0, $lte: 5 } }),
      User.countDocuments(),
      User.countDocuments({ role: "admin" }),
      Order.countDocuments(),
      Order.countDocuments({ status: "pending" }),
      Return.countDocuments(),
      Return.countDocuments({ status: { $in: ["requested", "approved"] } }),
      // Cancelled orders never became money.
      Order.aggregate([
        { $match: { status: { $ne: "cancelled" } } },
        { $group: { _id: null, revenue: { $sum: "$total" }, count: { $sum: 1 } } }
      ]),
      Order.find().sort({ placedAt: -1 }).limit(5)
    ]);

    const revenue = revenueRows[0] ? revenueRows[0].revenue : 0;
    const paidOrders = revenueRows[0] ? revenueRows[0].count : 0;

    res.json({
      success: true,
      stats: {
        products: { total: products, active: activeProducts, outOfStock, lowStock },
        users: { total: users, admins, customers: users - admins },
        orders: { total: orders, pending: pendingOrders },
        returns: { total: returns, open: openReturns },
        revenue: {
          total: Math.round(revenue * 100) / 100,
          orders: paidOrders,
          average: paidOrders ? Math.round((revenue / paidOrders) * 100) / 100 : 0
        }
      },
      recentOrders
    });
  } catch (error) {
    next(error);
  }
}

/* ---------- GET /api/admin/users ---------- */

async function listUsers(req, res, next) {
  try {
    const { role, search } = req.query;
    const filter = {};

    if (role === "admin" || role === "customer") { filter.role = role; }

    if (search && String(search).trim()) {
      const safe = String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(safe, "i");
      filter.$or = [{ name: rx }, { email: rx }];
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));

    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      User.countDocuments(filter)
    ]);

    // Order counts per user, so the table can show "3 orders" without N+1.
    const emails = users.map((u) => u.email);
    const counts = await Order.aggregate([
      { $match: { "customer.email": { $in: emails } } },
      { $group: { _id: "$customer.email", orders: { $sum: 1 }, spent: { $sum: "$total" } } }
    ]);
    const byEmail = new Map(counts.map((row) => [row._id, row]));

    res.json({
      success: true,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      users: users.map((u) => {
        const row = byEmail.get(u.email);
        return {
          ...u.toPublic(),
          lastLoginAt: u.lastLoginAt,
          orders: row ? row.orders : 0,
          spent: row ? Math.round(row.spent * 100) / 100 : 0
        };
      })
    });
  } catch (error) {
    next(error);
  }
}

/* ---------- PATCH /api/admin/users/:id ---------- */

async function updateUserRole(req, res, next) {
  try {
    const { role } = req.body;
    if (!["customer", "admin"].includes(role)) {
      throw ApiError.badRequest("Role must be customer or admin.", { code: "BAD_ROLE" });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      throw ApiError.notFound("We couldn't find that account.", { code: "USER_NOT_FOUND" });
    }

    // Locking yourself out of the admin area is never the intent.
    if (user._id.equals(req.user._id) && role !== "admin") {
      throw ApiError.badRequest(
        "You can't remove your own admin access.",
        { code: "SELF_DEMOTE" }
      );
    }

    // The store must always have at least one administrator.
    if (user.role === "admin" && role === "customer") {
      const admins = await User.countDocuments({ role: "admin" });
      if (admins <= 1) {
        throw ApiError.badRequest(
          "This is the only administrator — promote someone else first.",
          { code: "LAST_ADMIN" }
        );
      }
    }

    user.role = role;
    await user.save();

    res.json({ success: true, user: user.toPublic() });
  } catch (error) {
    next(error);
  }
}

/* ---------- DELETE /api/admin/users/:id ---------- */

async function deleteUser(req, res, next) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      throw ApiError.notFound("We couldn't find that account.", { code: "USER_NOT_FOUND" });
    }

    if (user._id.equals(req.user._id)) {
      throw ApiError.badRequest("You can't delete your own account here.", { code: "SELF_DELETE" });
    }
    if (user.role === "admin") {
      const admins = await User.countDocuments({ role: "admin" });
      if (admins <= 1) {
        throw ApiError.badRequest(
          "This is the only administrator and cannot be deleted.",
          { code: "LAST_ADMIN" }
        );
      }
    }

    // Orders keep the customer snapshot, so history survives the deletion.
    await User.deleteOne({ _id: user._id });

    res.json({ success: true, message: `${user.email} has been removed.` });
  } catch (error) {
    next(error);
  }
}

/* ---------- POST /api/admin/products ---------- */

async function createProduct(req, res, next) {
  try {
    const body = req.body || {};

    // Numeric ids are ours to assign, not the client's.
    const highest = await Product.findOne().sort({ id: -1 }).select("id");
    const nextId = (highest ? highest.id : 0) + 1;

    const product = await Product.create({
      id: nextId,
      name: body.name,
      category: body.category,
      price: body.price,
      oldPrice: body.oldPrice === "" || body.oldPrice === undefined ? null : body.oldPrice,
      image: body.image,
      shortDescription: body.shortDescription,
      description: body.description || "",
      features: Array.isArray(body.features) ? body.features.filter(Boolean) : [],
      rating: body.rating ?? 0,
      reviews: body.reviews ?? 0,
      stock: body.stock ?? 0,
      badge: body.badge || null,
      featured: body.featured === true,
      active: true
    });

    res.status(201).json({ success: true, product });
  } catch (error) {
    next(error);
  }
}

/* ---------- PATCH /api/admin/products/:id ---------- */

async function updateProduct(req, res, next) {
  try {
    const id = Number(req.params.id);
    const product = await Product.findOne({ id });
    if (!product) {
      throw ApiError.notFound("We couldn't find that product.", { code: "PRODUCT_NOT_FOUND" });
    }

    // Allowlist: `id` and timestamps are never client-writable.
    const fields = [
      "name", "category", "price", "oldPrice", "image", "shortDescription",
      "description", "features", "rating", "reviews", "stock", "badge",
      "featured", "active"
    ];

    for (const field of fields) {
      if (!(field in req.body)) { continue; }
      let value = req.body[field];
      if (field === "oldPrice" && (value === "" || value === undefined)) { value = null; }
      if (field === "badge" && value === "") { value = null; }
      if (field === "features" && !Array.isArray(value)) { continue; }
      product[field] = value;
    }

    await product.save();
    res.json({ success: true, product });
  } catch (error) {
    next(error);
  }
}

/* ---------- DELETE /api/admin/products/:id ---------- */

async function deleteProduct(req, res, next) {
  try {
    const id = Number(req.params.id);
    const product = await Product.findOne({ id });
    if (!product) {
      throw ApiError.notFound("We couldn't find that product.", { code: "PRODUCT_NOT_FOUND" });
    }

    // Default to archiving. A product referenced by past orders should stop
    // being sold without vanishing from that history.
    const hard = req.query.hard === "true";

    if (hard) {
      const used = await Order.countDocuments({ "items.productId": id });
      if (used > 0) {
        throw ApiError.conflict(
          `${product.name} appears in ${used} order(s) — archive it instead of deleting.`,
          { code: "PRODUCT_IN_USE" }
        );
      }
      await Product.deleteOne({ id });
      return res.json({ success: true, message: `${product.name} deleted.`, deleted: true });
    }

    product.active = false;
    await product.save();
    res.json({ success: true, message: `${product.name} archived.`, product });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getStats,
  listUsers,
  updateUserRole,
  deleteUser,
  createProduct,
  updateProduct,
  deleteProduct
};
