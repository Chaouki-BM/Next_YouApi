const express = require("express");
const {
  generateTrainingPlan,
} = require("../controllers/TrainingPlan.controller");

const router = express.Router();

router.post("/generate", generateTrainingPlan);

module.exports = router;
