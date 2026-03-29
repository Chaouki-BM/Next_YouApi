const mongoose = require("mongoose");

const BodyAnalysisSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      unique: true,
    },
    current_weight: { type: Number, required: true, min: 0 },
    current_bmi: { type: Number, default: 0, min: 0 },
    bmi_category: {
      type: String,
      enum: ["underweight", "normal", "overweight", "obese"],
      default: null,
    },
    current_muscle_mass: { type: Number, default: 0, min: 0 },
    is_weight_lost: { type: Boolean, default: false },
    goal_weight: { type: Number, default: null },
    total_calories_burned: { type: Number, default: 0, min: 0 },
    total_time_minutes: { type: Number, default: 0, min: 0 },
    workout_streak: { type: Number, default: 0, min: 0 },
    longest_streak: { type: Number, default: 0, min: 0 },
    total_sessions: { type: Number, default: 0, min: 0 },
    last_session_date: { type: Date, default: null },
  },
  { timestamps: true },
);

module.exports = mongoose.model("BodyAnalysis", BodyAnalysisSchema);
