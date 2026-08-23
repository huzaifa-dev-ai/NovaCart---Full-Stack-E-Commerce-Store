/* =============================================================
   NovaCart — return routes  (mounted at /api/returns)
   ============================================================= */

const express = require("express");
const {
  requestReturn, myReturns, listReturns, updateReturn
} = require("../controllers/returnController");
const { protect, requireRole } = require("../middleware/auth");
const { returnRules } = require("../middleware/validate");

const router = express.Router();

router.get("/", protect, requireRole("admin"), listReturns);
router.get("/mine", protect, myReturns);
router.post("/", protect, returnRules, requestReturn);
router.patch("/:id", protect, requireRole("admin"), updateReturn);

module.exports = router;
