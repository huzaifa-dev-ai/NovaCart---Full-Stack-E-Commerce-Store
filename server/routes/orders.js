/* =============================================================
   NovaCart — order routes  (mounted at /api/orders)
   ============================================================= */

const express = require("express");
const {
  createOrder, myOrders, getOrder, listOrders, updateOrderStatus
} = require("../controllers/orderController");
const { protect, attachUser, requireRole } = require("../middleware/auth");
const { checkoutRules } = require("../middleware/validate");

const router = express.Router();

// Admin listing must be declared before "/:number", or "mine" and a
// numeric page would be read as an order number.
router.get("/", protect, requireRole("admin"), listOrders);
router.get("/mine", protect, myOrders);

// attachUser: guests may check out; a signed-in buyer gets the order linked
// to their account so it appears in "my orders".
router.post("/", attachUser, checkoutRules, createOrder);

router.patch("/:id", protect, requireRole("admin"), updateOrderStatus);
router.get("/:number", protect, getOrder);

module.exports = router;
