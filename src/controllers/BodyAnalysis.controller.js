const { asyncHandler } = require("../utils/asyncHandler");
const {
  createOrGetBodyAnalysis,
  submitWeeklyCheckIn,
  getWeeklyChart,
  getMonthlyChart,
} = require("../services/BodyAnalysis.service");

// POST /api/body-analysis/checkin
exports.submitCheckIn = asyncHandler(async (req, res) => {
  const { weight } = req.body;
  console.log("weight", weight);

  if (!weight || typeof weight !== "number" || weight < 20 || weight > 300) {
    return res.status(400).json({
      success: false,
      error: "weight must be a number between 20 and 300",
    });
  }

  const { checkIn, bodyAnalysis } = await submitWeeklyCheckIn(req.userId, {
    weight,
  });

  return res.status(201).json({ success: true, checkIn, bodyAnalysis });
});

// GET /api/body-analysis/summary
exports.getSummary = asyncHandler(async (req, res) => {
  const data = await createOrGetBodyAnalysis(req.userId);
  return res.status(200).json({ success: true, data });
});

// GET /api/body-analysis/chart/weekly
exports.getWeeklyChartData = asyncHandler(async (req, res) => {
  const data = await getWeeklyChart(req.userId);
  return res.status(200).json({ success: true, data });
});

// GET /api/body-analysis/chart/monthly
exports.getMonthlyChartData = asyncHandler(async (req, res) => {
  const data = await getMonthlyChart(req.userId);
  return res.status(200).json({ success: true, data });
});
