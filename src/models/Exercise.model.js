const mongoose = require("mongoose");

const exerciseSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    focus: {
      type: String,
      required: true,
      trim: true,
    },
    difficulty: {
      type: String,
      enum: ["Beginner", "Intermediate", "Advanced"],
      required: true,
    },
    durationMin: {
      type: Number,
      required: true,
      min: 1,
    },
    workoutData: {
      type: {
        title: {
          type: String,
          required: true,
          trim: true,
        },
        focus: {
          type: String,
          required: true,
          trim: true,
        },
        focusDescription: {
          type: String,
          required: true,
          trim: true,
        },
        bpm: {
          type: Number,
          required: true,
          min: 0,
        },
        calories: {
          type: Number,
          required: true,
          min: 0,
        },
        sets: [
          {
            label: {
              type: String,
              required: true,
              trim: true,
            },
            reps: {
              type: String,
              required: true,
              trim: true,
            },
            status: {
              type: String,
              enum: ["done", "next", "locked"],
              default: "locked",
            },
          },
        ],
      },
      required: true,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("exercise", exerciseSchema);
