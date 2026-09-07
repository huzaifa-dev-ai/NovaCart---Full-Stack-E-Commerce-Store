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
const path = require("path");
const fsp = require("fs").promises;

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
  // The wording speaks to the dashboard, where pictures are chosen with a
  // button. The test itself is unchanged: it is what stands between a
  // hand-made request and a path pointing anywhere it likes.
  if (!path) { return "Choose a picture."; }
  if (!/^assets\/[A-Za-z0-9 ()._\/-]+$/.test(path)) {
    return "A picture must be one of the store's own files, kept under assets/.";
  }
  if (path.includes("..")) { return "An image path cannot step outside assets/."; }
  return null;
}

/**
 * The checks a colour must pass, wherever it arrives from: the form for a new
 * product, or a colour added to one that already exists. Complaints are handed
 * to `at`, so each caller answers for its own field name.
 */
function readColorRow(row, at) {
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

  return {
    label, swatchHex, image, gallery: [],
    stockCount: Number.isInteger(count) && count >= 0 ? count : 0,
    inStock: Number.isInteger(count) && count > 0
  };
}

/**
 * An id derived from the colour's name that nothing has claimed yet. `taken`
 * carries the ids already spoken for - which, for a colour being added to a
 * product, means the ones already on that product, not merely the others in
 * the same batch. Two colours sharing an id would be sold as one.
 */
function uniqueColorId(label, taken, position) {
  const base = slugifyLabel(label);
  let id = base || `color-${position}`;
  let n = 2;
  while (taken.has(id)) { id = `${base || "color"}-${n}`; n += 1; }
  taken.add(id);
  return id;
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
    const colour = readColorRow(row, at);
    colour.id = uniqueColorId(colour.label, seen, i + 1);
    return colour;
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
/**
 * Colours added to a product that already exists.
 *
 * This is deliberately a different door from `colors`, which a PATCH never
 * honours: that omission is what stops the stock-and-picture form from
 * rewriting an existing colour's name, swatch or photograph. This one may
 * only APPEND, so that guarantee is untouched - nothing already on the
 * product is read, moved or overwritten here.
 */
/**
 * The swatch shown beside a colour's name, per colour:
 * `variantSwatches: { "<colorId>": "#1E293B" }`.
 *
 * A swatch is decoration and nothing else - it names no file and moves no
 * stock - so it gets its own narrow door rather than reopening `colors`,
 * which a PATCH still never honours. Name, picture and id stay out of reach.
 */
function applyVariantSwatches(product, variantSwatches) {
  const colors = product.colors || [];
  const errors = [];

  Object.keys(variantSwatches).forEach((colorId) => {
    const colour = colors.find((c) => c.id === colorId);
    if (!colour) {
      errors.push({ field: `variantSwatches.${colorId}`,
        message: `This product has no colour called "${colorId}".` });
      return;
    }
    const next = String(variantSwatches[colorId] || "").trim();
    if (!/^#[0-9a-f]{6}$/i.test(next)) {
      errors.push({ field: `variantSwatches.${colorId}`,
        message: `${colour.label} needs a swatch like #1E293B.` });
      return;
    }
    colour.swatchHex = next;
  });

  if (errors.length) {
    throw ApiError.validation("Please check the highlighted fields.", errors);
  }
}

/**
 * Renaming colours already on the product:
 * `variantLabels: { "<colorId>": "Ivory" }`.
 *
 * The id deliberately does NOT follow the name. Carts, open orders and past
 * receipts all point at the id; regenerating it from the new name would
 * quietly orphan every one of them. The id is plumbing, the label is what
 * the shopper reads, and only the label changes here.
 */
function applyVariantLabels(product, variantLabels) {
  const colors = product.colors || [];
  const errors = [];

  Object.keys(variantLabels).forEach((colorId) => {
    const colour = colors.find((c) => c.id === colorId);
    if (!colour) {
      errors.push({ field: `variantLabels.${colorId}`,
        message: `This product has no colour called "${colorId}".` });
      return;
    }
    const next = String(variantLabels[colorId] || "").trim();
    if (!next) {
      errors.push({ field: `variantLabels.${colorId}`, message: "Give this colour a name." });
      return;
    }
    if (next.length > 40) {
      errors.push({ field: `variantLabels.${colorId}`,
        message: "A colour name must be 40 characters or fewer." });
      return;
    }
    colour.label = next;
  });

  if (errors.length) {
    throw ApiError.validation("Please check the highlighted fields.", errors);
  }
}

/**
 * Taking colours off a product: `removeColors: ["<colorId>", ...]`.
 *
 * At least one must survive. A product with no colours keeps its stock in a
 * single number instead, and emptying the list here would silently throw that
 * number away along with the counts - so the last one is refused rather than
 * quietly reinterpreted.
 */
function removeColorVariants(product, raw) {
  if (!Array.isArray(raw) || !raw.length) { return; }

  const colors = product.colors || [];
  const wanted = raw.map((x) => String(x || "").trim()).filter(Boolean);
  const errors = [];

  wanted.forEach((colorId) => {
    if (!colors.some((c) => c.id === colorId)) {
      errors.push({ field: `removeColors.${colorId}`,
        message: `This product has no colour called "${colorId}".` });
    }
  });
  if (errors.length) {
    throw ApiError.validation("Please check the highlighted fields.", errors);
  }

  const doomed = new Set(wanted);
  const survivors = colors.filter((c) => !doomed.has(c.id));
  if (!survivors.length) {
    throw ApiError.validation("Please check the highlighted fields.", [{
      field: "removeColors",
      message: "Keep at least one colour. A product cannot be left with none."
    }]);
  }

  product.colors = survivors;
}

/**
 * Which colour the product opens on, and whose photograph the catalogue card
 * carries: `defaultColorId: "<colorId>"`. Read after colours have been added
 * and removed, so it can name one that has only just arrived.
 */
function applyDefaultColor(product, wanted) {
  const colors = product.colors || [];
  const next = String(wanted || "").trim();
  if (!next) { return; }

  if (!colors.some((c) => c.id === next)) {
    throw ApiError.validation("Please check the highlighted fields.", [{
      field: "defaultColorId",
      message: `This product has no colour called "${next}".`
    }]);
  }
  product.defaultColorId = next;
}

/**
 * The last word on a product's colours, run once after every change to them.
 *
 * Three things have to agree and are easy to leave disagreeing: the total is
 * the sum of the counts, the default names a colour that exists, and the card
 * carries that colour's photograph. Settling them in one place means no
 * caller has to remember to.
 */
function settleColorState(product) {
  const colors = product.colors || [];
  if (!colors.length) {
    product.defaultColorId = null;
    return;
  }

  if (!colors.some((c) => c.id === product.defaultColorId)) {
    product.defaultColorId = colors[0].id;
  }
  const shown = colors.find((c) => c.id === product.defaultColorId);
  if (shown && shown.image) { product.image = shown.image; }

  product.stock = colors.reduce((sum, c) => sum + (Number(c.stockCount) || 0), 0);
  colors.forEach((c) => { c.inStock = (Number(c.stockCount) || 0) > 0; });
}

function appendColorVariants(product, raw) {
  if (!Array.isArray(raw) || !raw.length) { return; }

  const existing = product.colors || [];
  if (existing.length + raw.length > MAX_COLORS) {
    throw ApiError.validation("Please check the highlighted fields.", [{
      field: "addColors",
      message: `A product can hold at most ${MAX_COLORS} colours, and this one already has ` +
        `${existing.length}. There is room for ${Math.max(0, MAX_COLORS - existing.length)} more.`
    }]);
  }

  const errors = [];
  const taken = new Set(existing.map((c) => c.id));
  const added = raw.map((row, i) => {
    const at = (msg) => errors.push({ field: `addColors.${i}`, message: msg });
    const colour = readColorRow(row, at);
    colour.id = uniqueColorId(colour.label, taken, existing.length + i + 1);
    return colour;
  });

  if (errors.length) {
    throw ApiError.validation("Please check the highlighted fields.", errors);
  }

  added.forEach((colour) => { product.colors.push(colour); });

  // Once a product has colours at all, the parts are the truth: the total is
  // what the counts add up to, never a number carried separately.
  product.stock = product.colors.reduce((sum, c) => sum + (Number(c.stockCount) || 0), 0);

  // A product that had no colours until now needs one to open on, and the
  // card follows it, exactly as it does everywhere else.
  if (!product.defaultColorId) { product.defaultColorId = product.colors[0].id; }
  const shown = product.colors.find((c) => c.id === product.defaultColorId) || product.colors[0];
  if (shown) { product.image = shown.image; }
}

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

  // A colour left in the catalogue without a picture cannot be saved: the
  // model requires one. Mongoose would refuse it in words meant for a
  // developer, pinned to the product rather than the colour at fault. Say
  // which colour instead, while the remedy is one button away.
  const reported = new Set(errors.map((e) => e.field));
  colors.forEach((colour) => {
    const field = `variantImages.${colour.id}`;
    if (reported.has(field)) { return; }
    if (!String(colour.image || "").trim()) {
      errors.push({ field, message: `${colour.label}: choose a picture for this colour.` });
    }
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

/* ---------- POST /api/admin/products/image ---------- */

const IMAGE_DIR = path.join(__dirname, "..", "..", "public", "assets", "images", "products", "framed");
const THUMB_DIR = path.join(IMAGE_DIR, "thumb");
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/**
 * Accept a product photograph that the dashboard has already squared and
 * resized, and file it where the storefront expects.
 *
 * The framing happens in the browser on a canvas rather than here, which
 * keeps a native image library out of the dependency list - this project has
 * no build step and installs with nothing but npm install. What arrives is
 * therefore already the exact two sizes the shop serves.
 *
 * Nothing that arrives is trusted. The bytes are re-checked for a JPEG
 * signature, the sizes are capped, and the FILENAME is rebuilt from scratch
 * rather than sanitised - a name is only ever letters, digits and hyphens
 * here, so there is no traversal to strip and no extension to argue about.
 */
function safeImageName(raw) {
  const base = String(raw || "")
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")      // drop whatever extension came with it
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "product-image";
}

/** Decode a data: URL we produced ourselves, refusing anything else. */
function decodeJpegDataUrl(value, label) {
  const prefix = "data:image/jpeg;base64,";
  const text = String(value || "");
  if (!text.startsWith(prefix)) {
    throw ApiError.validation("Please check the highlighted fields.",
      [{ field: "image", message: `The ${label} image was not in the expected format.` }]);
  }
  const bytes = Buffer.from(text.slice(prefix.length), "base64");
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) {
    throw ApiError.validation("Please check the highlighted fields.",
      [{ field: "image", message: `The ${label} image is empty or too large.` }]);
  }
  // A JPEG starts FF D8 FF and ends FF D9. Cheap, and it means a renamed
  // script cannot be filed away as a picture.
  if (bytes[0] !== 0xFF || bytes[1] !== 0xD8 || bytes[2] !== 0xFF) {
    throw ApiError.validation("Please check the highlighted fields.",
      [{ field: "image", message: `The ${label} image is not a JPEG.` }]);
  }
  return bytes;
}

async function uploadProductImage(req, res, next) {
  try {
    const body = req.body || {};
    const full = decodeJpegDataUrl(body.full, "full-size");
    const thumb = decodeJpegDataUrl(body.thumb, "thumbnail");

    await fsp.mkdir(THUMB_DIR, { recursive: true });

    // Never overwrite a picture another product might be using: settle on a
    // free name instead of destroying one.
    const wanted = safeImageName(body.name);
    let name = `${wanted}.jpg`;
    for (let n = 2; n < 500; n += 1) {
      try {
        await fsp.access(path.join(IMAGE_DIR, name));
        name = `${wanted}-${n}.jpg`;
      } catch (missing) {
        break;                       // this one is free
      }
    }

    await fsp.writeFile(path.join(IMAGE_DIR, name), full);
    await fsp.writeFile(path.join(THUMB_DIR, name), thumb);

    res.status(201).json({
      success: true,
      path: `assets/images/products/framed/${name}`,
      bytes: full.length,
      thumbBytes: thumb.length
    });
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

    if (req.body.variantSwatches && typeof req.body.variantSwatches === "object") {
      applyVariantSwatches(product, req.body.variantSwatches);
    }

    if (req.body.variantLabels && typeof req.body.variantLabels === "object") {
      applyVariantLabels(product, req.body.variantLabels);
    }

    // Removals run before additions, so a colour can be taken off and another
    // put on in the same save without the pair briefly breaching the ceiling.
    if ("removeColors" in req.body) {
      removeColorVariants(product, req.body.removeColors);
    }

    // Colours added to a product that already has some. After the stock work
    // above, so the recomputed total takes in both the counts just set on the
    // existing colours and the ones arriving with the new.
    if ("addColors" in req.body) {
      appendColorVariants(product, req.body.addColors);
    }

    // Last, so it may name a colour that arrived in this very request.
    if ("defaultColorId" in req.body) {
      applyDefaultColor(product, req.body.defaultColorId);
    }

    // One place where the total, the default and the card picture are made to
    // agree, whichever of the above ran.
    settleColorState(product);

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
  deleteProduct,
  uploadProductImage
};
