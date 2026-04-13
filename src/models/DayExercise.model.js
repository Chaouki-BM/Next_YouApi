const mongoose = require("mongoose");

const dayExerciseSchema = new mongoose.Schema(
  {
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "trainingPlan",
      required: true,
      index: true,
    },
    workoutDayId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "workoutDay",
      required: true,
      index: true,
    },
    exerciseId: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: ["push", "pull", "legs", "core", "cardio", "mobility"],
      required: true,
    },
    muscleGroup: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["compound", "isolation"],
      required: true,
    },
    block: {
      type: String,
      enum: ["warmUp", "mainWorkout", "cooldown"],
      required: true,
    },
    sets: {
      type: Number,
      min: 0,
      default: 0,
    },
    reps: {
      type: String,
      trim: true,
      default: "",
    },
    durationMin: {
      type: Number,
      min: 0,
      default: 0,
    },
    restSeconds: {
      type: Number,
      min: 0,
      default: 0,
    },
    intensity: {
      type: Number,
      min: 1,
      max: 10,
      required: true,
    },
    volume: {
      type: String,
      required: true,
      trim: true,
    },
    estimatedCalories: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("dayExercise", dayExerciseSchema);
