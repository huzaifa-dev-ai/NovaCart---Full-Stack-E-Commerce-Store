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

    // Colours, when the form offered any. They settle three things at once:
    // the variants themselves, which one is the default, and the product
    // image — the card and the default swatch have to show the same photo.
    const variants = buildColorVariants(body.colors);

    // The plain image field was only ever checked for being non-empty, so a
    // Windows path pasted out of Explorer sailed through and produced a live
    // product with a broken picture. Same rule as the colour paths.
    if (!variants) {
      const problem = badImagePath(body.image);
      if (problem) {
        throw ApiError.validation("Please check the highlighted fields.",
          [{ field: "image", message: problem }]);
      }
    }

    const product = await Product.create({
      id: nextId,
      name: body.name,
      category: body.category,
      price: body.price,
      oldPrice: body.oldPrice === "" || body.oldPrice === undefined ? null : body.oldPrice,
      image: variants ? variants.image : body.image,
      shortDescription: body.shortDescription,
      description: body.description || "",
      features: Array.isArray(body.features) ? body.features.filter(Boolean) : [],
      rating: body.rating ?? 0,
      reviews: body.reviews ?? 0,
      // With colours the total is the sum of the parts, never a separate number.
      stock: variants ? variants.stock : (body.stock ?? 0),
      colors: variants ? variants.colors : [],
      defaultColorId: variants ? variants.defaultColorId : null,
      badge: body.badge || null,
      featured: body.featured === true,
      active: true
    });

    res.status(201).json({ success: true, product });
  } catch (error) {
    next(error);
  }
}

/**
 * Push a product's stock level down into its colour variants.
 *
 * Stock is recorded in two places and read from both: `product.stock` is what
 * the catalogue card and the cart's quantity limit use, while
 * `colors[].stockCount` is what the product page shows, what disables a
 * swatch, and — the one that really matters — what createOrder validates
 * against before it will sell anything.
 *
 * The admin form only ever wrote `product.stock`, so restocking changed a
 * number nothing sells from: the shop went on saying "Out of Stock" and the
 * server went on refusing the order. In the other direction it was worse —
 * zeroing the stock did not actually take the product off sale, because the
 * variant counts it validates against were untouched.
 *
 * The existing balance between colours is kept where there is one to keep, so
 * restocking a product that had 10 black and 2 white does not silently flatten
 * it to 6 and 6. With nothing to go on, it splits evenly.
 */
function applyStockToVariants(product, total) {
  const colors = product.colors || [];
  const wanted = Math.max(0, Math.floor(Number(total) || 0));

  if (!colors.length) {          // no variants: the single number is the truth
    product.stock = wanted;
    return;
  }

  const current = colors.map((c) => Math.max(0, Number(c.stockCount) || 0));
  const currentTotal = current.reduce((sum, n) => sum + n, 0);

  const shares = currentTotal > 0
    ? current.map((n) => Math.floor((wanted * n) / currentTotal))
    : colors.map(() => Math.floor(wanted / colors.length));

  // Whatever the division left over goes to the earliest variants, so the
  // parts always add back up to exactly what the admin typed.
  let remainder = wanted - shares.reduce((sum, n) => sum + n, 0);
  for (let i = 0; remainder > 0; i = (i + 1) % colors.length) {
    shares[i] += 1;
    remainder -= 1;
  }

  colors.forEach((colour, i) => {
    colour.stockCount = shares[i];
    colour.inStock = shares[i] > 0;
  });
  product.stock = shares.reduce((sum, n) => sum + n, 0);
}

/**
 * Turn the colour rows typed into the new-product form into stored variants.
 *
 * Returns null when no colours were given, so a plain single-image product
 * carries on working exactly as before.
 *
 * Two things are settled here rather than left to the caller, because the
 * storefront depends on both:
 *   - the card and the default swatch must show the SAME photograph, so the
 *     product image is taken from the first colour rather than typed twice
 *   - product.stock is the sum of the parts, never its own separate number
 */
const MAX_COLORS = 12;

function slugifyLabel(label) {
  return String(label).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * Image paths are same-origin relative paths under assets/, and nothing else.
 * The CSP only serves images from 'self' anyway, so an absolute URL would
 * render as a broken image; refusing it here says so plainly instead of
 * storing something that can never display. It also keeps a scheme like
 * javascript: or a traversal out of an attribute heading for the DOM.
 */
function badImagePath(value) {
  const path = String(value || "").trim();
  if (!path) { return "An image path is required."; }
  if (!/^assets\/[A-Za-z0-9 ()._\/-]+$/.test(path)) {
    return "Use a path inside assets/, for example assets/images/products/framed/name.jpg";
  }
  if (path.includes("..")) { return "An image path cannot step outside assets/."; }
  return null;
}

function buildColorVariants(raw) {
  if (!Array.isArray(raw) || !raw.length) { return null; }

  const errors = [];
  if (raw.length > MAX_COLORS) {
    errors.push({ field: "colors", message: `A product can have at most ${MAX_COLORS} colours.` });
  }

  const seen = new Set();
  const colors = raw.slice(0, MAX_COLORS).map((row, i) => {
    const at = (msg) => errors.push({ field: `colors.${i}`, message: msg });
    const label = String((row && row.label) || "").trim();
    const swatchHex = String((row && row.swatchHex) || "").trim();
    const image = String((row && row.image) || "").trim();
    const count = Number(row && row.stockCount);

    if (!label) { at("Give this colour a name."); }
    if (label.length > 40) { at("A colour name must be 40 characters or fewer."); }
    if (!/^#[0-9a-f]{6}$/i.test(swatchHex)) { at(`"${label || "This colour"}" needs a swatch like #1E293B.`); }
    const imageProblem = badImagePath(image);
    if (imageProblem) { at(`${label || "This colour"}: ${imageProblem}`); }
    if (!Number.isInteger(count) || count < 0 || count > 100000) {
      at(`Stock for ${label || "this colour"} must be a whole number of 0 or more.`);
    }

    // Two colours can be named alike by accident; the ids still have to differ.
    let id = slugifyLabel(label) || `color-${i + 1}`;
    let n = 2;
    while (seen.has(id)) { id = `${slugifyLabel(label) || "color"}-${n}`; n += 1; }
    seen.add(id);

    return {
      id, label, swatchHex, image, gallery: [],
      stockCount: Number.isInteger(count) && count >= 0 ? count : 0,
      inStock: Number.isInteger(count) && count > 0
    };
  });

  if (errors.length) {
    throw ApiError.validation("Please check the highlighted fields.", errors);
  }

  return {
    colors,
    defaultColorId: colors[0].id,
    image: colors[0].image,
    stock: colors.reduce((sum, c) => sum + c.stockCount, 0)
  };
}

/**
 * Set stock per colour, from `variantStock: { "<colorId>": <count>, ... }`.
 *
 * Deliberately narrow: this accepts a count against a colour id and nothing
 * else. Taking a whole colours array from the client would open a route to
 * rewriting labels, swatch hex and image paths through the stock form, which
 * is a much wider door than the job needs.
 *
 * Colours left out of the payload keep the stock they had, so editing one
 * colour cannot silently zero the others.
 */
function applyVariantStock(product, variantStock) {
  const colors = product.colors || [];
  const errors = [];

  Object.keys(variantStock).forEach((colorId) => {
    const colour = colors.find((c) => c.id === colorId);
    if (!colour) {
      errors.push({ field: `variantStock.${colorId}`,
        message: `This product has no colour called "${colorId}".` });
      return;
    }
    const raw = variantStock[colorId];
    const count = Number(raw);
    if (!Number.isInteger(count) || count < 0 || count > 100000) {
      errors.push({ field: `variantStock.${colorId}`,
        message: `Stock for ${colour.label} must be a whole number of 0 or more.` });
      return;
    }
    colour.stockCount = count;
    colour.inStock = count > 0;
  });

  if (errors.length) {
    throw ApiError.validation("Please check the highlighted fields.", errors);
  }

  // The product total is never typed in when colours carry their own counts —
  // it is whatever the parts add up to, so the two cannot drift.
  product.stock = colors.reduce((sum, c) => sum + (Number(c.stockCount) || 0), 0);
}

/**
 * Repoint a colour at a different photograph, from
 * `variantImages: { "<colorId>": "assets/..." }`.
 *
 * Same narrow shape as the stock map, and the same path rule: relative, and
 * inside assets/. Colours left out keep the photo they had.
 *
 * The catalogue card shows the DEFAULT colour's photograph, so changing that
 * one moves the card with it. Leaving them to diverge is how a product ends
 * up advertised in a colour it no longer opens on.
 */
function applyVariantImages(product, variantImages) {
  const colors = product.colors || [];
  const errors = [];

  Object.keys(variantImages).forEach((colorId) => {
    const colour = colors.find((c) => c.id === colorId);
    if (!colour) {
      errors.push({ field: `variantImages.${colorId}`,
        message: `This product has no colour called "${colorId}".` });
      return;
    }
    const next = String(variantImages[colorId] || "").trim();
    const problem = badImagePath(next);
    if (problem) {
      errors.push({ field: `variantImages.${colorId}`, message: `${colour.label}: ${problem}` });
      return;
    }
    colour.image = next;
  });

  if (errors.length) {
    throw ApiError.validation("Please check the highlighted fields.", errors);
  }

  const fallback = colors[0];
  const defaultColour = colors.find((c) => c.id === product.defaultColorId) || fallback;
  if (defaultColour) { product.image = defaultColour.image; }
}

/**
 * A sale price only means anything below the original, so the model refuses
 * oldPrice <= price. Its message names only "old price", which is baffling
 * when what you just did was raise the price — you get told off about a field
 * you never touched, with neither number in front of you.
 *
 * This says which two numbers collide and what to do about it, and puts the
 * complaint on the field the admin actually edited so the form highlights
 * something they were looking at. The sale is never silently cancelled for
 * them; changing what a product costs stays a deliberate act.
 */
function assertSalePriceMakesSense(product, body) {
  const original = product.oldPrice;
  if (original === null || original === undefined) { return; }
  if (Number(original) > Number(product.price)) { return; }

  const money = (n) => "$" + Number(n).toFixed(2);
  const editedOriginal = "oldPrice" in body;
  const field = editedOriginal ? "oldPrice" : "price";
  const message = editedOriginal
    ? `The original price ${money(original)} has to be above the current price `
      + `${money(product.price)}. Raise it, or clear it to end the sale.`
    : `${money(product.price)} is not below the original price of ${money(original)}, `
      + `so it would not be a sale. Lower it, or clear the original price first.`;

  throw ApiError.validation("Please check the highlighted fields.", [{ field, message }]);
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
      if (field === "stock") { continue; }   // handled below, across the variants
      product[field] = value;
    }

    // Stock goes through the helper so it reaches the variant counts the
    // storefront reads and createOrder validates against, not only the
    // product-level total the form used to write on its own.
    // Per-colour counts are the more specific instruction, so they win when
    // both arrive; the form only ever sends one or the other.
    if (req.body.variantStock && typeof req.body.variantStock === "object") {
      applyVariantStock(product, req.body.variantStock);
    } else if ("stock" in req.body) {
      applyStockToVariants(product, req.body.stock);
    }

    // Images before the sale-price check, so a bad path is reported alongside
    // everything else rather than after a save has already happened.
    if (req.body.variantImages && typeof req.body.variantImages === "object") {
      applyVariantImages(product, req.body.variantImages);
    }

    if ("image" in req.body) {
      const problem = badImagePath(req.body.image);
      if (problem) {
        throw ApiError.validation("Please check the highlighted fields.",
          [{ field: "image", message: problem }]);
      }
    }

    assertSalePriceMakesSense(product, req.body);

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
