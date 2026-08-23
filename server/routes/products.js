/* =============================================================
   NovaCart — product routes  (mounted at /api/products)
   -------------------------------------------------------------
   All read-only and public: browsing the catalog needs no account.
   Admin create/update/delete will mount here behind
   protect + requireRole("admin").
   ============================================================= */

const express = require("express");

const {
  listProducts,
  listCategories,
  getProduct
} = require("../controllers/productController");

const router = express.Router();

// Must precede "/:id", or "categories" would be read as an id.
router.get("/categories", listCategories);

router.get("/", listProducts);
router.get("/:id", getProduct);

module.exports = router;
