/* =============================================================
   NovaCart — admin routes  (mounted at /api/admin)
   -------------------------------------------------------------
   Everything here requires a signed-in administrator. The guard is
   applied once to the whole router, so a new route cannot be added
   without protection by accident.
   ============================================================= */

const express = require("express");
const {
  getStats, listUsers, updateUserRole, deleteUser,
  createProduct, updateProduct, deleteProduct, uploadProductImage
} = require("../controllers/adminController");
const { protect, requireRole } = require("../middleware/auth");
const { productRules, productUpdateRules } = require("../middleware/validate");

const router = express.Router();

router.use(protect, requireRole("admin"));

router.get("/stats", getStats);

router.get("/users", listUsers);
router.patch("/users/:id", updateUserRole);
router.delete("/users/:id", deleteUser);

// A framed photograph plus its thumbnail, as two base64 JPEGs. These need
// more room than the 100kb global body limit, which is right for every other
// route. That larger limit is granted to this path alone in app.js, where it
// can be mounted ahead of the global parser - a limit set here would arrive
// too late, the body having already been read and refused.
router.post("/products/image", uploadProductImage);

router.post("/products", productRules, createProduct);
router.patch("/products/:id", productUpdateRules, updateProduct);
router.delete("/products/:id", deleteProduct);

module.exports = router;
