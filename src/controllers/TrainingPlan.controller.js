const trainingPlanService = require("../services/TrainingPlan.service");
const { asyncHandler } = require("../utils/asyncHandler");

const generateTrainingPlan = asyncHandler(async (req, res) => {
  const result = await trainingPlanService.generatePlan(req.body);
  return res.status(201).json(result);
});

const getTrainingPlan = asyncHandler(async (req, res) => {
  const result = await trainingPlanService.getPlanById(req.params.planId);
  return res.status(200).json({
    success: true,
    data: result,
  });
});

const getTrainingPlanByUserId = asyncHandler(async (req, res) => {
  const result = await trainingPlanService.getLatestPlanByUserId(
    req.params.userId,
  );
  return res.status(200).json({
    success: true,
    data: result,
  });
});

module.exports = {
  generateTrainingPlan,
  getTrainingPlan,
  getTrainingPlanByUserId,
};
