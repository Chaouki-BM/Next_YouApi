const {
  generateNutritionPlanFromGemini,
  saveNutritionPlan,
  getUserNutritionPlan,
  deleteNutritionPlan,
} = require("../services/nutritionPlan.service");
const { asyncHandler } = require("../utils/asyncHandler");
const { calculateMetrics } = require("../utils/bodyMetrics");
const User = require("../models/User.model");
const BodyAnalysis = require("../models/BodyAnalysis.model");

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
    const userId = req.user?._id || req.userId || req.body.userId;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required when token is not provided",
      });
    }

    const [user, bodyAnalysis] = await Promise.all([
      User.findById(userId).populate("profile").lean(),
      BodyAnalysis.findOne({ userId }).lean(),
    ]);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const profile = user.profile || {};
    const userProfile = {
      ...profile,
      ...req.body,
      current_weight:
        req.body.current_weight ??
        bodyAnalysis?.current_weight ??
        profile.weight,
      goal_weight:
        req.body.goal_weight ??
        bodyAnalysis?.goal_weight ??
        profile.target_weight,
      injury_notes: req.body.injury_notes || profile.injury_notes || "none",
    };

    const required = [
      "height",
      "weight",
      "current_weight",
      "goal_weight",
      "age_years",
      "sex",
      "activity_level_lifestyle",
      "experience_level",
      "focus_goal",
      "medical_condition",
      "allergies",
      "country",
    ];

    const missing = required.filter(
      (field) =>
        userProfile[field] === undefined ||
        userProfile[field] === null ||
        userProfile[field] === "",
    );

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missing.join(", ")}`,
      });
    }

    const metrics = calculateMetrics({
      weightKg: toNumber(userProfile.current_weight || userProfile.weight, 0),
      heightCm: toNumber(userProfile.height, 0),
      age: toNumber(userProfile.age_years, 0),
      gender: String(userProfile.sex || "").toLowerCase(),
      targetWeight: toNumber(userProfile.goal_weight, 0),
      level: String(userProfile.experience_level || "beginner").toLowerCase(),
    });

    userProfile.current_bmi = metrics.bmi;
    userProfile.bmi_category = metrics.bmi_category;
    userProfile.current_muscle_mass = metrics.muscle_mass;
    if (!bodyAnalysis?.current_bmi) {
      userProfile.current_bmi = metrics.bmi;
    } else {
      userProfile.current_bmi = bodyAnalysis.current_bmi;
    }
    if (!bodyAnalysis?.bmi_category) {
      userProfile.bmi_category = metrics.bmi_category;
    } else {
      userProfile.bmi_category = bodyAnalysis.bmi_category;
    }
    if (!bodyAnalysis?.current_muscle_mass) {
      userProfile.current_muscle_mass = metrics.muscle_mass;
    } else {
      userProfile.current_muscle_mass = bodyAnalysis.current_muscle_mass;
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
