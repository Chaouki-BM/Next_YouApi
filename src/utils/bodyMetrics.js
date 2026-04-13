const ACTIVITY_MULTIPLIER_BY_LEVEL = {
  beginner: 1.375,
  intermediate: 1.55,
  advanced: 1.725,
};

function normalizeLower(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function calculateBmi(weightKg, heightCm) {
  const heightM = Number(heightCm) / 100;
  if (!Number.isFinite(heightM) || heightM <= 0) return 0;
  return parseFloat((Number(weightKg) / (heightM * heightM)).toFixed(1));
}

function getBmiCategory(bmi) {
  if (bmi < 18.5) return "underweight";
  if (bmi < 25) return "normal";
  if (bmi < 30) return "overweight";
  return "obese";
}

function calculateBmr({ weightKg, heightCm, age, gender }) {
  const g = normalizeLower(gender);
  const base =
    10 * Number(weightKg) + 6.25 * Number(heightCm) - 5 * Number(age);
  if (g === "female") return base - 161;
  return base + 5;
}

function calculateCalorieTarget({
  weightKg,
  heightCm,
  age,
  gender,
  level,
  targetWeight,
}) {
  const bmr = calculateBmr({ weightKg, heightCm, age, gender });
  const activity =
    ACTIVITY_MULTIPLIER_BY_LEVEL[normalizeLower(level)] ||
    ACTIVITY_MULTIPLIER_BY_LEVEL.beginner;
  const tdee = bmr * activity;

  let adjusted = tdee;
  if (Number(targetWeight) > Number(weightKg)) {
    adjusted += 250;
  } else if (Number(targetWeight) < Number(weightKg)) {
    adjusted -= 400;
  }

  return Math.max(1200, Math.round(adjusted));
}

function calculateMetrics({
  weightKg,
  heightCm,
  age,
  gender,
  targetWeight,
  level,
}) {
  const bmi = calculateBmi(weightKg, heightCm);

  let lbm = 0;
  if (gender === "male") {
    lbm = 0.407 * weightKg + 0.267 * heightCm - 19.2;
  } else if (gender === "female") {
    lbm = 0.252 * weightKg + 0.473 * heightCm - 48.3;
  }

  const muscle_mass = parseFloat((lbm * 0.9).toFixed(1));

  const bmi_category = getBmiCategory(bmi);
  const calorieTarget = calculateCalorieTarget({
    weightKg,
    heightCm,
    age,
    gender,
    level,
    targetWeight,
  });

  return { bmi, muscle_mass, bmi_category, calorieTarget };
}

function getWeekNumber(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
  );
}

module.exports = {
  calculateMetrics,
  calculateBmi,
  calculateCalorieTarget,
  getWeekNumber,
};
