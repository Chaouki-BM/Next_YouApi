const express = require("express");
const verifyToken = require("../middlewares/auth.middleware");
const {
  generatePlan,
  getPlan,
  deletePlan,
} = require("../controllers/nutritionPlan.controller");

const router = express.Router();

router.post("/generate", verifyToken, generatePlan);
router.get("/", verifyToken, getPlan);
router.delete("/", verifyToken, deletePlan);

module.exports = router;
