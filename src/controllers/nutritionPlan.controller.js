const {
  generateNutritionPlanFromGemini,
  saveNutritionPlan,
  getUserNutritionPlan,
  deleteNutritionPlan,
} = require("../services/nutritionPlan.service");
const { asyncHandler } = require("../utils/asyncHandler");

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function estimateTdeeFromProfile(profile) {
  const weight = toNumber(profile.current_weight || profile.weight, 70);
  const height = toNumber(profile.height, 170);
  const age = toNumber(profile.age_years, 30);
  const sex = String(profile.sex || "female").toLowerCase();
  const activity = String(
    profile.activity_level_lifestyle || "moderate",
  ).toLowerCase();

  const activityMultiplierMap = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    "very active": 1.9,
  };

  const matchedActivity = Object.keys(activityMultiplierMap).find((key) =>
    activity.includes(key),
  );
  const activityMultiplier = activityMultiplierMap[matchedActivity] || 1.55;

  const bmr =
    10 * weight + 6.25 * height - 5 * age + (sex.startsWith("m") ? 5 : -161);
  return Math.max(1200, bmr * activityMultiplier);
}

function estimateWeeksToReachGoal(profile, generatedPlan) {
  const currentWeight = toNumber(profile.current_weight || profile.weight, 0);
  const goalWeight = toNumber(profile.goal_weight, 0);

  if (!currentWeight || !goalWeight || currentWeight === goalWeight) {
    return 0;
  }

  const weightDeltaKg = goalWeight - currentWeight;
  const targetCalories = toNumber(generatedPlan?.dailyTargets?.calories, 0);
  const tdee = toNumber(
    generatedPlan?.dailyTargets?.tdee,
    estimateTdeeFromProfile(profile),
  );

  if (!targetCalories || !tdee) {
    return null;
  }

  const dailyDeficit = tdee - targetCalories;
  const dailySurplus = targetCalories - tdee;

  // Approximation: 1 kg body weight change ~ 7700 kcal.
  const kcalNeeded = Math.abs(weightDeltaKg) * 7700;
  const dailyEnergyChange = weightDeltaKg < 0 ? dailyDeficit : dailySurplus;

  if (dailyEnergyChange <= 0) {
    return null;
  }

  const weeks = Math.ceil(kcalNeeded / (dailyEnergyChange * 7));
  return Number.isFinite(weeks) ? Math.max(1, weeks) : null;
}

const generatePlan = async (req, res, next) => {
  try {
    const userProfile = req.body;

    const required = [
      "height",
      "weight",
      "current_weight",
      "goal_weight",
      "age_years",
      "sex",
      "current_bmi",
      "bmi_category",
      "current_muscle_mass",
      "activity_level_lifestyle",
      "experience_level",
      "focus_goal",
      "medical_condition",
      "allergies",
      "injury_notes",
      "country",
    ];

    const missing = required.filter(
      (field) =>
        req.body[field] === undefined ||
        req.body[field] === null ||
        req.body[field] === "",
    );

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missing.join(", ")}`,
      });
    }

    userProfile.estimated_tdee = Math.round(
      estimateTdeeFromProfile(userProfile),
    );
    const requestedPlanWeeks = toNumber(req.body.plan_weeks, 0);
    userProfile.plan_weeks = Math.max(
      1,
      Math.min(
        52,
        requestedPlanWeeks > 0
          ? Math.round(requestedPlanWeeks)
          : Math.round(estimateTdeeFromProfile(userProfile)),
      ),
    );

    const geminiResult = await generateNutritionPlanFromGemini(userProfile);
    const userId = req.user?._id || req.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: user id not found in request",
      });
    }

    const plan = await saveNutritionPlan(userId, geminiResult);
    const weeksToReachGoal = estimateWeeksToReachGoal(
      userProfile,
      geminiResult,
    );

    return res.status(201).json({
      success: true,
      data: plan,
      weeksToReachGoal,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Returns the authenticated user's active nutrition plan.
 */
const getPlan = asyncHandler(async (req, res) => {
  const userId = req.user?._id || req.userId;
  const week = req.query.week;
  const plan = await getUserNutritionPlan(userId, week);

  return res.status(200).json({
    success: true,
    data: plan,
  });
});

/**
 * Deletes the authenticated user's active nutrition plan and related meals.
 */
const deletePlan = asyncHandler(async (req, res) => {
  const userId = req.user?._id || req.userId;
  const result = await deleteNutritionPlan(userId);

  return res.status(200).json({
    success: true,
    data: result,
  });
});

module.exports = {
  generatePlan,
  getPlan,
  deletePlan,
};
