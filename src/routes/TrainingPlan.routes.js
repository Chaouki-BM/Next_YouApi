const express = require("express");
const {
  generateTrainingPlan,
  getTrainingPlan,
  getTrainingPlanByUserId,
} = require("../controllers/TrainingPlan.controller");

const router = express.Router();

router.post("/generate-plan", generateTrainingPlan);
router.get("/user/:userId", getTrainingPlanByUserId);
router.get("/:planId", getTrainingPlan);

module.exports = router;
