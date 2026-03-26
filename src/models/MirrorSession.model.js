const mongoose = require("mongoose");

const mirrorSessionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      default: null,
    },
    status: {
      type: String,
      enum: ["pending", "connected", "expired"],
      default: "pending",
    },
    exerciseStatus: {
      type: String,
      enum: ["idle", "exercising", "stopped"],
      default: "idle",
    },
    total_calories: {
      type: Number,
      default: 0,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    exercises: [
      {
        name: {
          type: String,
        },
        target_reps: {
          type: Number,
        },
        target_sets: {
          type: Number,
        },
        rest_seconds: {
          type: Number,
        },
        startedAt: {
          type: Date,
        },
        completedAt: {
          type: Date,
        },
        reps_done: {
          type: Number,
          default: 0,
        },
        reps_correct: {
          type: Number,
          default: 0,
        },
        reps_incorrect: {
          type: Number,
          default: 0,
        },
        sets_done: {
          type: Number,
          default: 0,
        },
        duration_sec: {
          type: Number,
          default: 0,
        },
        calories_burned: {
          type: Number,
          default: 0,
        },
      },
    ],
  },
  { timestamps: true },
);

module.exports = mongoose.model("MirrorSession", mirrorSessionSchema);
