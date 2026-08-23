/* =============================================================
   NovaCart — product controller
   -------------------------------------------------------------
   GET /api/products              list, with filters and paging
   GET /api/products/categories   category names with counts
   GET /api/products/:id          one product + related items
   ============================================================= */

const Product = require("../models/Product");
const ApiError = require("../utils/ApiError");

const MAX_LIMIT = 100;

/** Only these are accepted, so a query string can't sort by arbitrary paths. */
const SORTS = {
  featured: { featured: -1, id: 1 },
  newest: { createdAt: -1, id: 1 },
  "price-asc": { price: 1, id: 1 },
  "price-desc": { price: -1, id: 1 },
  rating: { rating: -1, reviews: -1 },
  name: { name: 1 }
};

/* ---------- GET /api/products ---------- */

async function listProducts(req, res, next) {
  try {
    const { category, badge, search, featured, inStock, sort } = req.query;

    const filter = { active: true };

    if (category && category !== "All") { filter.category = category; }
    if (badge === "Sale" || badge === "New") { filter.badge = badge; }
    if (featured === "true") { filter.featured = true; }
    if (inStock === "true") { filter.stock = { $gt: 0 }; }

    if (search && String(search).trim()) {
      // Escaped so a shopper typing "(" can't break the query or make it
      // pathologically slow.
      const safe = String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(safe, "i");
      filter.$or = [{ name: rx }, { shortDescription: rx }, { category: rx }];
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || MAX_LIMIT));
    const order = SORTS[sort] || SORTS.featured;

    const [products, total] = await Promise.all([
      Product.find(filter).sort(order).skip((page - 1) * limit).limit(limit),
      Product.countDocuments(filter)
    ]);

    res.json({
      success: true,
      count: products.length,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      products
    });
  } catch (error) {
    next(error);
  }
}

/* ---------- GET /api/products/categories ---------- */

async function listCategories(_req, res, next) {
  try {
    const rows = await Product.aggregate([
      { $match: { active: true } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, category: "$_id", count: 1 } }
    ]);

    const total = rows.reduce((sum, row) => sum + row.count, 0);
    res.json({ success: true, total, categories: rows });
  } catch (error) {
    next(error);
  }
}

/* ---------- GET /api/products/:id ---------- */

async function getProduct(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      throw ApiError.badRequest("That product id isn't valid.", { code: "BAD_PRODUCT_ID" });
    }

    const product = await Product.findOne({ id, active: true });
    if (!product) {
      throw ApiError.notFound("We couldn't find that product.", { code: "PRODUCT_NOT_FOUND" });
    }

    // Same category first; top up with anything else so the row is never sparse.
    const sameCategory = await Product.find({
      active: true,
      category: product.category,
      id: { $ne: product.id }
    }).sort({ featured: -1, rating: -1 }).limit(4);

    let related = sameCategory;
    if (related.length < 4) {
      const filler = await Product.find({
        active: true,
        id: { $nin: [product.id, ...related.map((p) => p.id)] }
      }).sort({ featured: -1, rating: -1 }).limit(4 - related.length);
      related = related.concat(filler);
    }

    res.json({ success: true, product, related });
  } catch (error) {
    next(error);
  }
}

module.exports = { listProducts, listCategories, getProduct };
