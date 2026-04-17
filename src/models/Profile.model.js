const mongoose = require("mongoose");

const profileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      unique: true,
    },
    height: { type: Number, required: true },
    weight: { type: Number, required: true },
    age_years: { type: Number, required: true },
    sex: { type: String, enum: ["male", "female"], required: true },
    activity_level_lifestyle: {
      type: String,
      enum: ["beginner", "intermediate", "advanced", "athlete"],
      required: true,
    },
    medical_condition: {
      type: [String],
      default: [],
    },
    allergies: {
      type: [String],
      default: [],
    },
    country: {
      type: String,
      default: "",
      trim: true,
    },
    target_weight: {
      type: Number,
      required: false,
    },
    experience_level: {
      type: String,
      default: "",
      trim: true,
    },
    focus_goal: {
      type: String,
      default: "",
      trim: true,
    },
    splitType: {
      type: String,
      enum: ["full_body", "upper_lower", "push_pull_legs"],
      default: "full_body",
      trim: true,
      lowercase: true,
    },
    workout_days: {
      type: [String],
      default: [],
    },
    preferred_training_time: {
      type: String,
      default: "",
      trim: true,
    },
    session_duration: {
      type: Number,
      required: false,
    },
    injury_notes: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("profile", profileSchema);
