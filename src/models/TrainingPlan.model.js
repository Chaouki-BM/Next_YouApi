const mongoose = require("mongoose");

const trainingPlanSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },

    goal: {
      type: String,
      enum: [
        "weight_loss",
        "strength",
        "endurance",
        "flexibility",
        "recovery",
        "event",
      ],
      required: true,
    },

    level: {
      type: String,
      enum: ["beginner", "intermediate", "advanced"],
      required: true,
    },

    daysPerWeek: {
      type: Number,
      required: true,
      min: 1,
      max: 7,
      default: 3,
    },

    splitType: {
      type: String,
      enum: ["full_body", "upper_lower", "push_pull_legs"],
      required: true,
      default: "full_body",
    },

    targetWeight: {
      type: Number,
      default: 0,
    },

    bmi: {
      type: Number,
      default: 0,
    },

    bmiCategory: {
      type: String,
      enum: ["underweight", "normal", "overweight", "obese", "unknown"],
      default: "unknown",
    },

    calorieTarget: {
      type: Number,
      default: 0,
    },

    summary: {
      trainingStyle: String,
      daysPerWeek: Number,
      sessionDuration: Number,
    },

    startDate: {
      type: Date,
      default: Date.now,
    },

    durationWeeks: {
      type: Number,
      required: true,
      default: 4,
    },

    weeklyPlan: [
      {
        day: Number,

        focus: String,

        warmUp: [
          {
            exerciseId: String,
            name: String,
            duration: String,
          },
        ],

        mainWorkout: [
          {
            exerciseId: String,

            name: String,

            category: String,

            sets: Number,

            reps: String,

            rest: String,
          },
        ],

        cardio: [
          {
            exerciseId: String,
            name: String,
            duration: String,
          },
        ],

        cooldown: [
          {
            exerciseId: String,
            name: String,
            duration: String,
          },
        ],

        estimatedCalories: Number,

        duration: Number,
      },
    ],

    cyclePlan: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },

    progressionPlan: {
      week1: String,
      week2: String,
      week3: String,
      week4: String,
    },

    safetyNotes: [String],
  },
  { timestamps: true },
);

module.exports = mongoose.model("trainingPlan", trainingPlanSchema);
