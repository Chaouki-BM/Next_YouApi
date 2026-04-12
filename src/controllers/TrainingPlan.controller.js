const trainingPlanService = require("../services/TrainingPlan.service");
const { asyncHandler } = require("../utils/asyncHandler");

const generateTrainingPlan = asyncHandler(async (req, res) => {
  const result = trainingPlanService.generatePlan(req.body);
  await trainingPlanService.savePlan(result);
  return res.status(200).json(result);
});

module.exports = {
  generateTrainingPlan,
};
