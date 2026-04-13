const mongoose = require("mongoose");

const workoutDaySchema = new mongoose.Schema(
  {
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "trainingPlan",
      required: true,
      index: true,
    },
    weekNumber: {
      type: Number,
      required: true,
      min: 1,
    },
    dayNumber: {
      type: Number,
      required: true,
      min: 1,
    },
    dayType: {
      type: String,
      enum: ["push", "pull", "legs", "full_body", "rest"],
      required: true,
    },
  },
  { timestamps: true },
);

workoutDaySchema.index(
  { planId: 1, weekNumber: 1, dayNumber: 1 },
  { unique: true },
);

module.exports = mongoose.model("workoutDay", workoutDaySchema);
