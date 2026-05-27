const mongoose = require("mongoose");
const Groq = require("groq-sdk");
const NutritionPlan = require("../models/NutritionPlan.model");
const Meal = require("../models/Meal.model");

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const DEFAULT_MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"];

function getGroqApiKey() {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    const error = new Error("GROQ_API_KEY is missing in environment variables");
    error.status = 500;
    throw error;
  }
  return apiKey;
}

/**
 * Resolves ISO alpha-2 country code to full country name.
 * Example: "TN" -> "Tunisia", "IT" -> "Italy"
 */
function resolveCountryName(countryValue) {
  const raw = String(countryValue || "").trim();
  if (!raw) return "the user's country";

  if (/^[a-zA-Z]{2}$/.test(raw)) {
    try {
      const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
      const displayName = regionNames.of(raw.toUpperCase());
      if (displayName) return displayName;
    } catch (_) {}
  }

  return raw;
}

function formatPromptValue(value) {
  if (Array.isArray(value)) {
    return value.length ? value.join(", ") : "None";
  }

  if (value === null || value === undefined || value === "") {
    return "None";
  }

  return String(value);
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sanitizeNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 0) return 0;
  return Math.round(parsed);
}

function normalizeMealType(value, index = 0) {
  const lowered = String(value || "")
    .trim()
    .toLowerCase();

  if (lowered.includes("breakfast")) return "breakfast";
  if (lowered.includes("lunch")) return "lunch";
  if (lowered.includes("dinner")) return "dinner";
  if (lowered.includes("snack")) return "snack";

  return DEFAULT_MEAL_TYPES[index % DEFAULT_MEAL_TYPES.length];
}

function normalizeFoods(foods) {
  if (!Array.isArray(foods)) {
    return [];
  }

  return foods
    .map((food) => String(food || "").trim())
    .filter((food) => food.length > 0);
}

function extractWeekNumber(dayLabel, fallbackWeek = 1) {
  const text = String(dayLabel || "");
  const match = text.match(/week\s*(\d+)/i);
  const parsed = Number(match?.[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackWeek;
}

function groupMealPlanByWeek(mealPlan) {
  const weeklyMap = new Map();

  for (let i = 0; i < mealPlan.length; i += 1) {
    const dayPlan = mealPlan[i] || {};
    const fallbackWeek = Math.floor(i / 7) + 1;
    const week = extractWeekNumber(dayPlan.day, fallbackWeek);

    if (!weeklyMap.has(week)) {
      weeklyMap.set(week, []);
    }

    weeklyMap.get(week).push(dayPlan);
  }

  return Array.from(weeklyMap.entries()).sort((a, b) => a[0] - b[0]);
}

function normalizeDayLabel(dayLabel, fallbackDayIndex = 0) {
  const text = String(dayLabel || "");
  const suffix = text.includes("-") ? text.split("-").pop().trim() : "";
  return suffix || DAYS[fallbackDayIndex % DAYS.length];
}

function expandMealPlanToRequestedWeeks(parsedPlan, requestedWeeks) {
  const targetWeeks = Math.max(1, Math.min(52, toNumber(requestedWeeks, 1)));
  const originalMealPlan = Array.isArray(parsedPlan?.mealPlan)
    ? parsedPlan.mealPlan
    : [];

  if (!originalMealPlan.length) {
    return parsedPlan;
  }

  const weeklyGroups = groupMealPlanByWeek(originalMealPlan);
  const existingWeeks = weeklyGroups.length;

  if (existingWeeks >= targetWeeks) {
    return parsedPlan;
  }

  const sourceWeekMeals = weeklyGroups[0]?.[1] || originalMealPlan.slice(0, 7);
  const expandedMealPlan = [];

  for (let week = 1; week <= targetWeeks; week += 1) {
    const source =
      weeklyGroups[(week - 1) % existingWeeks]?.[1] || sourceWeekMeals;

    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const sourceDay = source[dayIndex % source.length] || {};
      const dayName = DAYS[dayIndex];
      const meals = Array.isArray(sourceDay.meals)
        ? sourceDay.meals.map((meal) => ({
            ...meal,
            foods: Array.isArray(meal?.foods) ? [...meal.foods] : [],
          }))
        : [];

      expandedMealPlan.push({
        ...sourceDay,
        day: `${normalizeDayLabel(dayName, dayIndex)}`,
        meals,
      });
    }
  }

  return {
    ...parsedPlan,
    mealPlan: expandedMealPlan,
  };
}

async function generateNutritionPlanFromGemini(userProfile) {
  const apiKey = getGroqApiKey();
  const groq = new Groq({ apiKey });
  const countryName = resolveCountryName(userProfile.country);
  const planWeeks = Math.max(
    1,
    Math.min(4, toNumber(userProfile.plan_weeks, 1)),
  );

  const prompt = `Certified nutritionist. Generate a ${planWeeks}-week meal plan. JSON only.

height:${formatPromptValue(userProfile.height)}cm weight:${formatPromptValue(userProfile.weight)}kg current:${formatPromptValue(userProfile.current_weight)}kg target:${formatPromptValue(userProfile.goal_weight)}kg
age:${formatPromptValue(userProfile.age_years)} sex:${formatPromptValue(userProfile.sex)} bmi:${formatPromptValue(userProfile.current_bmi)}(${formatPromptValue(userProfile.bmi_category)}) muscle:${formatPromptValue(userProfile.current_muscle_mass)}kg
activity:${formatPromptValue(userProfile.activity_level_lifestyle)} level:${formatPromptValue(userProfile.experience_level)} goal:${formatPromptValue(userProfile.focus_goal)}
conditions:${formatPromptValue(userProfile.medical_condition)} allergies:${formatPromptValue(userProfile.allergies)} injuries:${formatPromptValue(userProfile.injury_notes)}
country:${countryName} weeks:${planWeeks}

Calc BMR(Mifflin-St Jeor)→TDEE(activity multiplier)→target: fat loss=TDEE-450 muscle=TDEE+300 maintain=TDEE
Macros: protein 1.8-2.2g/kg fats 0.7-1.0g/kg carbs=(remaining kcal)/4

Plan: ${planWeeks} week(s) × 7 days. Label: "Monday"..."Sunday".
4 meals/day(Breakfast Lunch Dinner Snack). No repeated meals within same week.
Foods: real traditional dishes from ${countryName} only. Each food=name+quantity+unit(g/ml/piece). e.g."Grilled chicken(150g)".
No generic names. Skip allergy foods. Respect conditions. Day total=target±50kcal.

{"dailyTargets":{"calories":0,"bmr":0,"tdee":0,"protein":0,"carbs":0,"fats":0},"mealPlan":[{"day":"Monday","totalCalories":0,"meals":[{"name":"Breakfast","foods":["food(qty)"],"calories":0,"protein":0,"carbs":0,"fats":0},{"name":"Lunch","foods":["food(qty)"],"calories":0,"protein":0,"carbs":0,"fats":0},{"name":"Dinner","foods":["food(qty)"],"calories":0,"protein":0,"carbs":0,"fats":0},{"name":"Snack","foods":["food(qty)"],"calories":0,"protein":0,"carbs":0,"fats":0}]}]}`;

  const max_tokens = planWeeks * 2000;

  const MODEL_CANDIDATES = [
    process.env.GROQ_MODEL?.trim(),
    "llama-3.1-8b-instant",
    "llama-3.3-70b-versatile",
    "mixtral-8x7b-32768",
  ]
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i);

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  let rawText;
  let lastError;

  for (const modelName of MODEL_CANDIDATES) {
    try {
      const completion = await groq.chat.completions.create({
        model: modelName,
        messages: [
          {
            role: "system",
            content: "Return only valid JSON. No markdown. No explanation.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens,
        response_format: { type: "json_object" },
      });

      rawText = completion.choices[0]?.message?.content;
      console.log(`Groq model used: ${modelName}`);
      break;
    } catch (err) {
      lastError = err;
      const msg = String(err?.message || "");

      // Invalid API key stop immediately
      if (
        msg.includes("401") ||
        msg.includes("invalid_api_key") ||
        msg.includes("Authentication")
      ) {
        const error = new Error(
          "Groq API key is invalid. Set a valid GROQ_API_KEY in your .env file.",
        );
        error.status = 401;
        throw error;
      }

      // Model not found  try next
      if (msg.includes("404") || msg.includes("model_not_found")) {
        continue;
      }

      // Rate limit or overload  wait then try next
      if (
        msg.includes("429") ||
        msg.includes("503") ||
        msg.includes("rate_limit") ||
        msg.includes("overloaded")
      ) {
        console.warn(`Model ${modelName} unavailable, waiting 4s...`);
        await wait(4000);
        continue;
      }

      // Unknown error stop
      const error = new Error(`Groq request failed: ${msg}`);
      error.status = 502;
      throw error;
    }
  }

  if (!rawText) {
    const msg = String(lastError?.message || "");
    const error = new Error(
      msg
        ? `All Groq models failed. Please retry later. Last error: ${msg}`
        : "All Groq models failed. Please retry later.",
    );
    error.status = 429;
    throw error;
  }

  const cleaned = rawText.trim();

  try {
    const parsed = JSON.parse(cleaned);
    return expandMealPlanToRequestedWeeks(parsed, userProfile.plan_weeks);
  } catch (parseError) {
    const error = new Error(
      `Failed to parse Groq nutrition plan JSON: ${parseError.message}`,
    );
    error.status = 502;
    throw error;
  }
}

function normalizePlanForClient(planDoc) {
  const plan = planDoc?.toObject ? planDoc.toObject() : planDoc;

  return {
    _id: plan._id,
    user: plan.user,
    week: toNumber(plan.week, 1),
    dailyTargets: {
      calories: toNumber(plan?.dailyTargets?.calories),
      protein: toNumber(plan?.dailyTargets?.protein),
      carbs: toNumber(plan?.dailyTargets?.carbs),
      fats: toNumber(plan?.dailyTargets?.fats),
    },
    mealPlan: (plan.mealPlan || []).map((dayPlan, dayIndex) => ({
      day: String(dayPlan.day || DAYS[dayIndex] || `Day ${dayIndex + 1}`),
      meals: (dayPlan.meals || []).map((meal, mealIndex) => ({
        type: normalizeMealType(meal.name || meal.type, mealIndex),
        foods: normalizeFoods(meal.foods),
        calories: toNumber(meal.calories),
        protein: toNumber(meal.protein),
        carbs: toNumber(meal.carbs),
        fats: toNumber(meal.fats),
      })),
    })),
    isActive: Boolean(plan.isActive),
    generatedAt: plan.generatedAt,
  };
}

function buildPersistedTargets(generatedPlan) {
  const dailyTargets = generatedPlan?.dailyTargets || {};
  const calories = sanitizeNumber(dailyTargets.calories, 1800);

  return {
    calories,
    bmr: sanitizeNumber(dailyTargets.bmr, calories),
    tdee: sanitizeNumber(dailyTargets.tdee, calories),
    protein: sanitizeNumber(dailyTargets.protein),
    carbs: sanitizeNumber(dailyTargets.carbs),
    fats: sanitizeNumber(dailyTargets.fats),
  };
}

async function saveNutritionPlan(userId, generatedPlan) {
  if (!generatedPlan || !Array.isArray(generatedPlan.mealPlan)) {
    const error = new Error("Invalid nutrition plan payload");
    error.status = 400;
    throw error;
  }

  const existingPlans = await NutritionPlan.find({ user: userId }).select(
    "_id",
  );
  const existingPlanIds = existingPlans.map((plan) => plan._id);

  if (existingPlanIds.length > 0) {
    await Meal.deleteMany({ nutritionPlan: { $in: existingPlanIds } });
    await NutritionPlan.deleteMany({ user: userId });
  }

  // Backward-compat migration for older unique index on { user, isActive }.
  await NutritionPlan.collection.dropIndex("user_1_isActive_1").catch(() => {});

  const weeklyGroups = groupMealPlanByWeek(generatedPlan.mealPlan);
  const createdPlanIds = [];

  for (const [weekNumber, weekMealPlans] of weeklyGroups) {
    const nutritionPlanId = new mongoose.Types.ObjectId();
    const serializedMealPlan = [];

    for (const dayPlan of weekMealPlans) {
      const mealIds = [];

      for (const meal of dayPlan.meals || []) {
        const savedMeal = await Meal.create({
          name: normalizeMealType(meal.type || meal.name),
          foods: normalizeFoods(meal.foods),
          calories: sanitizeNumber(meal.calories),
          protein: sanitizeNumber(meal.protein),
          carbs: sanitizeNumber(meal.carbs),
          fats: sanitizeNumber(meal.fats),
          nutritionPlan: nutritionPlanId,
        });

        mealIds.push(savedMeal._id);
      }

      const totalCalories = (dayPlan.meals || []).reduce(
        (sum, meal) => sum + sanitizeNumber(meal.calories),
        0,
      );

      serializedMealPlan.push({
        day: String(dayPlan.day || `Week ${weekNumber} - Day`),
        totalCalories: sanitizeNumber(totalCalories),
        meals: mealIds,
      });
    }

    await NutritionPlan.create({
      _id: nutritionPlanId,
      user: userId,
      week: weekNumber,
      dailyTargets: buildPersistedTargets(generatedPlan),
      mealPlan: serializedMealPlan,
      isActive: true,
    });

    createdPlanIds.push(nutritionPlanId);
  }

  const savedPlans = await NutritionPlan.find({ _id: { $in: createdPlanIds } })
    .sort({ week: 1 })
    .populate("mealPlan.meals");

  return savedPlans.map((plan) => normalizePlanForClient(plan));
}

async function getUserNutritionPlan(userId, week) {
  const requestedWeek = toNumber(week, 0);

  if (requestedWeek > 0) {
    const plan = await NutritionPlan.findOne({
      user: userId,
      isActive: true,
      week: requestedWeek,
    }).populate("mealPlan.meals");

    if (!plan) {
      const error = new Error(
        `Active nutrition plan for week ${requestedWeek} not found`,
      );
      error.status = 404;
      throw error;
    }

    return normalizePlanForClient(plan);
  }

  const plans = await NutritionPlan.find({
    user: userId,
    isActive: true,
  })
    .sort({ week: 1 })
    .populate("mealPlan.meals");

  if (!plans.length) {
    const error = new Error("Active nutrition plan not found");
    error.status = 404;
    throw error;
  }

  return plans.map((plan) => normalizePlanForClient(plan));
}

async function deleteNutritionPlan(userId) {
  const activePlans = await NutritionPlan.find({
    user: userId,
    isActive: true,
  });

  if (!activePlans.length) {
    const error = new Error("Active nutrition plan not found");
    error.status = 404;
    throw error;
  }

  const activePlanIds = activePlans.map((plan) => plan._id);

  await Meal.deleteMany({ nutritionPlan: { $in: activePlanIds } });
  await NutritionPlan.deleteMany({ _id: { $in: activePlanIds } });

  return { message: "Nutrition plan deleted successfully" };
}

module.exports = {
  generateNutritionPlanFromGemini,
  saveNutritionPlan,
  getUserNutritionPlan,
  deleteNutritionPlan,
};
