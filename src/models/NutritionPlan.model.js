const mongoose = require("mongoose");

const DailyTargetsSchema = new mongoose.Schema(
  {
    calories: { type: Number, required: true },
    bmr: { type: Number, required: true },
    tdee: { type: Number, required: true },
    protein: { type: Number, required: true },
    carbs: { type: Number, required: true },
    fats: { type: Number, required: true },
  },
  { _id: false },
);

const DayMealPlanSchema = new mongoose.Schema(
  {
    day: { type: String, required: true },
    totalCalories: { type: Number, required: true },
    meals: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Meal",
        required: true,
      },
    ],
  },
  { _id: false },
);

const NutritionPlanSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    week: { type: Number, required: true, min: 1 },
    dailyTargets: { type: DailyTargetsSchema, required: true },
    mealPlan: { type: [DayMealPlanSchema], required: true },
    generatedAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// Keep one active weekly plan per user/week while preserving previous plan history.
NutritionPlanSchema.index(
  { user: 1, week: 1, isActive: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);

module.exports = mongoose.model("NutritionPlan", NutritionPlanSchema);
