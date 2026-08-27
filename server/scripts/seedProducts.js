/* =============================================================
   NovaCart — seed the product catalog
   -------------------------------------------------------------
   Loads the original catalog straight out of the frontend file
   (server/scripts/legacy-catalog.js) and writes it into MongoDB. Reading the
   real source rather than a hand-copied list means the migrated
   data cannot silently drift from what the site was showing.

   Idempotent — safe to run repeatedly:
     • missing product  -> inserted
     • existing product -> updated to match the source
     • nothing changed  -> left alone

   Run:  npm run seed:products
         npm run seed:products -- --fresh    (wipe the collection first)
   ============================================================= */

require("dotenv").config({ quiet: true });

const path = require("path");
const mongoose = require("mongoose");

const { connectDB, disconnectDB } = require("../config/db");
const Product = require("../models/Product");

const LEGACY_FILE = path.join(__dirname, "legacy-catalog.js");

/**
 * The legacy file is browser code: an IIFE that hangs functions off
 * `window.NovaCart`. Providing a fake window lets Node execute it as-is.
 */
async function loadLegacyCatalog() {
  global.window = { NovaCart: {} };
  // eslint-disable-next-line global-require, import/no-dynamic-require
  require(LEGACY_FILE);

  const App = global.window.NovaCart;
  if (!App || typeof App.getProducts !== "function") {
    throw new Error(`${LEGACY_FILE} did not define NovaCart.getProducts()`);
  }

  const products = await App.getProducts();
  delete global.window;
  return products;
}

async function seedProducts() {
  const fresh = process.argv.includes("--fresh");

  const catalog = await loadLegacyCatalog();
  console.log(`\n📦  Loaded ${catalog.length} products from the frontend catalog`);

  await connectDB();

  if (fresh) {
    const { deletedCount } = await Product.deleteMany({});
    console.log(`🧹  --fresh: removed ${deletedCount} existing product(s)`);
  }

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  for (const item of catalog) {
    const doc = {
      id: item.id,
      name: item.name,
      category: item.category,
      price: item.price,
      oldPrice: item.oldPrice ?? null,
      image: item.image,
      defaultColorId: item.defaultColorId || null,
      colors: item.colors || [],
      shortDescription: item.shortDescription,
      description: item.description || "",
      features: item.features || [],
      rating: item.rating ?? 0,
      reviews: item.reviews ?? 0,
      stock: item.stock ?? 0,
      badge: item.badge ?? null,
      featured: item.featured === true,
      active: true
    };

    const existing = await Product.findOne({ id: item.id });

    if (!existing) {
      await Product.create(doc);
      inserted += 1;
      continue;
    }

    // Only write when something actually differs, so re-runs are quiet.
    const differs = Object.keys(doc).some((key) => {
      const before = existing[key];
      const after = doc[key];
      if (Array.isArray(after)) {
        return JSON.stringify(before) !== JSON.stringify(after);
      }
      return String(before) !== String(after);
    });

    if (differs) {
      Object.assign(existing, doc);
      await existing.save();
      updated += 1;
    } else {
      unchanged += 1;
    }
  }

  console.log("");
  console.log(`✅  Catalog seeded`);
  console.log(`    inserted  : ${inserted}`);
  console.log(`    updated   : ${updated}`);
  console.log(`    unchanged : ${unchanged}`);

  const total = await Product.countDocuments();
  const featured = await Product.countDocuments({ featured: true });
  const outOfStock = await Product.countDocuments({ stock: 0 });
  const categories = await Product.distinct("category");

  console.log("");
  console.log(`    products collection → ${total} total, ${featured} featured, ${outOfStock} out of stock`);
  console.log(`    ${categories.length} categories: ${categories.sort().join(", ")}`);
  console.log("");

  await disconnectDB();
  await mongoose.disconnect().catch(() => {});
}

seedProducts().catch(async (error) => {
  console.error("\n❌  Product seeding failed:", error.friendly || error.message, "\n");
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
