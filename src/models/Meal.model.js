const mongoose = require("mongoose");

const MealSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    foods: {
      type: [String],
      required: true,
      validate: {
        validator: (foods) => Array.isArray(foods) && foods.length > 0,
        message: "foods is required and must contain at least one item",
      },
    },
    calories: { type: Number, required: true },
    protein: { type: Number, required: true },
    carbs: { type: Number, required: true },
    fats: { type: Number, required: true },
    nutritionPlan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "NutritionPlan",
      required: true,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Meal", MealSchema);
