const express = require("express");
const router = express.Router();
const verifyToken = require("../middlewares/auth.middleware");
const {
  submitCheckIn,
  getSummary,
  getWeeklyChartData,
  getMonthlyChartData,
} = require("../controllers/BodyAnalysis.controller");

router.post("/checkin", verifyToken, submitCheckIn);
router.get("/summary", verifyToken, getSummary);
router.get("/chart/weekly", verifyToken, getWeeklyChartData);
router.get("/chart/monthly", verifyToken, getMonthlyChartData);

module.exports = router;
