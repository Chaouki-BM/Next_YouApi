const express = require("express");
const {
  generateTrainingPlan,
  getTrainingPlan,
  getTrainingPlanByUserId,
  markWorkoutDayAsDone,
} = require("../controllers/TrainingPlan.controller");

const router = express.Router();

router.post("/generate-plan", generateTrainingPlan);
router.get("/user/:userId", getTrainingPlanByUserId);
router.get("/:planId", getTrainingPlan);
router.patch("/workout-day/:workoutDayId/done", markWorkoutDayAsDone);

module.exports = router;
