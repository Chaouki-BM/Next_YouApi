const mongoose = require("mongoose");

const WeeklyCheckInSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    date: { type: Date, required: true },
    week_number: { type: Number, required: true },
    month: { type: Number, required: true },
    year: { type: Number, required: true },
    weight: { type: Number, required: true, min: 0 },
    bmi: { type: Number, default: 0 },
    muscle_mass: { type: Number, default: 0 },
    calories_burned: { type: Number, default: 0 },
    time_minutes: { type: Number, default: 0 },
    sessions_count: { type: Number, default: 0 },
    source: {
      type: String,
      enum: ["manual", "smart_scale"],
      default: "manual",
    },
  },
  { timestamps: true },
);

WeeklyCheckInSchema.index(
  { userId: 1, week_number: 1, year: 1 },
  { unique: true },
);

module.exports = mongoose.model("WeeklyCheckIn", WeeklyCheckInSchema);
