const TrainingPlan = require("../models/TrainingPlan.model");
const WorkoutDay = require("../models/WorkoutDay.model");
const DayExercise = require("../models/DayExercise.model");
const User = require("../models/User.model");
const trainingExerciseLibrary = require("../utils/trainingExerciseLibrary");
const { calculateMetrics } = require("../utils/bodyMetrics");

const LEVEL_ORDER = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
};

const GOAL_ENUM = [
  "weight_loss",
  "strength",
  "endurance",
  "flexibility",
  "recovery",
  "event",
];

const SPLIT_PATTERNS = {
  push_pull_legs: ["push", "pull", "rest", "legs", "push", "rest"],
  full_body: ["full_body", "rest", "full_body", "rest", "full_body", "rest"],
  upper_lower: ["push", "legs", "rest", "pull", "legs", "rest"],
};

const MAIN_RULES = {
  push: { compound: 1, isolation: 2 },
  pull: { compound: 1, isolation: 2 },
};

const BASE_REPS = {
  beginner: "10-12",
  intermediate: "8-12",
  advanced: "6-10",
};

const DIFFICULTY_ORDER = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
};

const STRENGTH_STYLE_PROGRESSION_TABLE = {
  1: { sets: 3, reps: "10-12", intensity: 7, rest: "60s" },
  2: { sets: 3, reps: "10-12", intensity: 8, rest: "60s" },
  3: { sets: 4, reps: "8-10", intensity: 8, rest: "75s" },
  4: { sets: 4, reps: "8-10", intensity: 9, rest: "75s" },
  5: { sets: 4, reps: "6-8", intensity: 9, rest: "90s" },
  6: { sets: 4, reps: "6-8", intensity: 10, rest: "90s" },
  7: { sets: 3, reps: "12-15", intensity: 5, rest: "60s" },
  8: { sets: 4, reps: "8-10", intensity: 8, rest: "75s" },
  9: { sets: 4, reps: "6-8", intensity: 9, rest: "90s" },
  10: { sets: 5, reps: "6-8", intensity: 9, rest: "90s" },
  11: { sets: 5, reps: "4-6", intensity: 10, rest: "120s" },
  12: { sets: 4, reps: "4-6", intensity: 10, rest: "120s" },
};

const ENDURANCE_PROGRESSION_TABLE = {
  1: { sets: 3, reps: "15-20", intensity: 5, rest: "45s" },
  2: { sets: 3, reps: "15-20", intensity: 5, rest: "45s" },
  3: { sets: 4, reps: "15-20", intensity: 6, rest: "40s" },
  4: { sets: 4, reps: "18-22", intensity: 6, rest: "40s" },
  5: { sets: 4, reps: "18-22", intensity: 7, rest: "35s" },
  6: { sets: 3, reps: "12-15", intensity: 5, rest: "45s" },
  7: { sets: 4, reps: "18-22", intensity: 6, rest: "35s" },
  8: { sets: 4, reps: "20-25", intensity: 6, rest: "30s" },
  9: { sets: 4, reps: "20-25", intensity: 7, rest: "30s" },
  10: { sets: 3, reps: "12-15", intensity: 5, rest: "45s" },
  11: { sets: 4, reps: "20-25", intensity: 7, rest: "30s" },
  12: { sets: 4, reps: "20-25", intensity: 7, rest: "30s" },
};

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function getProgression(week, baseIntensity, goal) {
  const goalType = normalizeLower(goal);
  const table =
    goalType === "endurance"
      ? ENDURANCE_PROGRESSION_TABLE
      : STRENGTH_STYLE_PROGRESSION_TABLE;
  const template = table[Math.min(12, Math.max(1, week))];

  if (goalType === "endurance") {
    return {
      sets: template.sets,
      reps: template.reps,
      rest: template.rest,
      intensity: clamp(template.intensity, 4, 7),
      tempo: "1-0-1",
      circuit: true,
      circuitRoundRest: "60s",
      isDeload: week === 6 || week === 10,
    };
  }

  const intensityDelta = baseIntensity - 6;
  let intensity = template.intensity + intensityDelta;

  // Keep deload week in a dedicated low-intensity band.
  if (week === 7) {
    intensity = clamp(intensity, 5, 6);
  } else {
    intensity = clamp(intensity, 4, 10);
  }

  return {
    sets: template.sets,
    reps: template.reps,
    rest: template.rest,
    intensity,
    tempo: "2-0-2",
    circuit: false,
    circuitRoundRest: "",
    isDeload: week === 7,
  };
}

function getIntensityFromBMI(bmiCategory) {
  const normalized = normalizeLower(bmiCategory);
  if (normalized === "obese") return 4;
  if (normalized === "overweight") return 5;
  if (normalized === "normal") return 6;
  if (normalized === "underweight") return 5;
  return 5;
}

function shouldAddCardio(goal, weightKg, targetWeight) {
  if (normalizeLower(goal) === "weight_loss") return true;
  if (Number(weightKg) > Number(targetWeight)) return true;
  return false;
}

function normalizeLower(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function toInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function assert(condition, message, status = 400) {
  if (!condition) {
    const error = new Error(message);
    error.status = status;
    throw error;
  }
}

function resolveSplitType(splitType, daysPerWeek) {
  const normalized = normalizeLower(splitType);
  if (SPLIT_PATTERNS[normalized]) return normalized;

  if (daysPerWeek >= 4) return "push_pull_legs";
  return "full_body";
}

function getTargetSessionCalories(level) {
  if (level === "advanced") return 320;
  if (level === "intermediate") return 260;
  return 220;
}

function getWeekPhase(week) {
  if (week <= 4) return "base";
  if (week <= 8) return "variation";
  return "peak";
}

function getPlyometricPool(exercises) {
  return exercises.filter((exercise) => {
    const name = String(exercise?.name || "").toLowerCase();
    return /(jump squat|squat jump|box jump|burpee|mountain climber|tuck jump|skater jump|high knees)/i.test(
      name,
    );
  });
}

async function replaceUserTrainingPlans(userId) {
  const existingPlans = await TrainingPlan.find({ userId })
    .select("_id")
    .lean();
  if (!existingPlans.length) {
    return;
  }

  const existingPlanIds = existingPlans.map((plan) => plan._id);

  await Promise.all([
    DayExercise.deleteMany({ planId: { $in: existingPlanIds } }),
    WorkoutDay.deleteMany({ planId: { $in: existingPlanIds } }),
    TrainingPlan.deleteMany({ userId }),
  ]);
}

function difficultyScore(value) {
  return DIFFICULTY_ORDER[normalizeLower(value)] || 0;
}

function sortPool(pool, targetPerExerciseCalories, week) {
  const phase = getWeekPhase(week);

  const sorted = [...pool].sort((a, b) => {
    const aDiff = Math.abs(
      (a.workoutData?.calories || 0) - targetPerExerciseCalories,
    );
    const bDiff = Math.abs(
      (b.workoutData?.calories || 0) - targetPerExerciseCalories,
    );

    if (phase === "base") {
      const diffScore =
        difficultyScore(a.difficulty) - difficultyScore(b.difficulty);
      if (diffScore !== 0) return diffScore;
    }

    if (phase === "variation") {
      const aMid = Math.abs(difficultyScore(a.difficulty) - 2);
      const bMid = Math.abs(difficultyScore(b.difficulty) - 2);
      if (aMid !== bMid) return aMid - bMid;
    }

    if (phase === "peak") {
      const diffScore =
        difficultyScore(b.difficulty) - difficultyScore(a.difficulty);
      if (diffScore !== 0) return diffScore;
    }

    if (aDiff !== bDiff) return aDiff - bDiff;
    if (a.durationMin !== b.durationMin) return a.durationMin - b.durationMin;
    return String(a.name).localeCompare(String(b.name));
  });

  if (!sorted.length) return sorted;

  const offset = (Math.max(1, week) - 1) % sorted.length;
  return [...sorted.slice(offset), ...sorted.slice(0, offset)];
}

function pickExercises({
  pool,
  count,
  usedWeekIds,
  blockedMuscleGroups,
  targetPerExerciseCalories,
  week,
}) {
  const sorted = sortPool(pool, targetPerExerciseCalories, week);
  const picked = [];

  for (const exercise of sorted) {
    if (picked.length >= count) break;
    if (usedWeekIds.has(exercise._id)) continue;
    if (blockedMuscleGroups.has(exercise.muscleGroup)) continue;
    picked.push(exercise);
    usedWeekIds.add(exercise._id);
  }

  if (picked.length < count) {
    for (const exercise of sorted) {
      if (picked.length >= count) break;
      if (usedWeekIds.has(exercise._id)) continue;
      picked.push(exercise);
      usedWeekIds.add(exercise._id);
    }
  }

  return picked;
}

function getEligibleExercises(level) {
  const userLevelScore = LEVEL_ORDER[level];

  return trainingExerciseLibrary.filter((exercise) => {
    const difficultyScore =
      LEVEL_ORDER[normalizeLower(exercise.difficulty)] || 0;
    const category = normalizeLower(exercise.category);
    const validCategory = [
      "push",
      "pull",
      "legs",
      "core",
      "cardio",
      "mobility",
    ].includes(category);
    return (
      difficultyScore > 0 && difficultyScore <= userLevelScore && validCategory
    );
  });
}

function getPoolByCategory(exercises, category) {
  return exercises.filter(
    (exercise) => normalizeLower(exercise.category) === category,
  );
}

function filterExercisesByCategoryAndLevel(exercises, category, level) {
  const maxLevel = LEVEL_ORDER[level] || 0;
  return exercises.filter((exercise) => {
    const categoryOk = normalizeLower(exercise.category) === category;
    const difficultyOk =
      (LEVEL_ORDER[normalizeLower(exercise.difficulty)] || 0) <= maxLevel;
    return categoryOk && difficultyOk;
  });
}

function generatePushDay(args) {
  const { exercises, usedWeekIds, blockedMuscleGroups, level, week } = args;
  const targetSessionCalories = getTargetSessionCalories(level);
  const categoryPool = filterExercisesByCategoryAndLevel(
    exercises,
    "push",
    level,
  );
  const compoundPool = categoryPool.filter(
    (exercise) => exercise.type === "compound",
  );
  const isolationPool = categoryPool.filter(
    (exercise) => exercise.type === "isolation",
  );

  const compound = pickExercises({
    pool: compoundPool,
    count: MAIN_RULES.push.compound,
    usedWeekIds,
    blockedMuscleGroups,
    targetPerExerciseCalories: Math.round(targetSessionCalories / 3),
    week,
  });

  const isolation = pickExercises({
    pool: isolationPool,
    count: MAIN_RULES.push.isolation,
    usedWeekIds,
    blockedMuscleGroups,
    targetPerExerciseCalories: Math.round(targetSessionCalories / 3),
    week,
  });

  assert(
    compound.length === 1 && isolation.length === 2,
    "Insufficient push exercises to satisfy rule set",
  );
  return [...compound, ...isolation];
}

function generatePullDay(args) {
  const { exercises, usedWeekIds, blockedMuscleGroups, level, week } = args;
  const targetSessionCalories = getTargetSessionCalories(level);
  const categoryPool = filterExercisesByCategoryAndLevel(
    exercises,
    "pull",
    level,
  );
  const compoundPool = categoryPool.filter(
    (exercise) => exercise.type === "compound",
  );
  const isolationPool = categoryPool.filter(
    (exercise) => exercise.type === "isolation",
  );

  const compound = pickExercises({
    pool: compoundPool,
    count: MAIN_RULES.pull.compound,
    usedWeekIds,
    blockedMuscleGroups,
    targetPerExerciseCalories: Math.round(targetSessionCalories / 3),
    week,
  });

  const isolation = pickExercises({
    pool: isolationPool,
    count: MAIN_RULES.pull.isolation,
    usedWeekIds,
    blockedMuscleGroups,
    targetPerExerciseCalories: Math.round(targetSessionCalories / 3),
    week,
  });

  assert(
    compound.length === 1 && isolation.length === 2,
    "Insufficient pull exercises to satisfy rule set",
  );
  return [...compound, ...isolation];
}

function generateLegsDay(args) {
  const { exercises, usedWeekIds, blockedMuscleGroups, week, level } = args;
  const targetSessionCalories = getTargetSessionCalories(level);
  const categoryPool = filterExercisesByCategoryAndLevel(
    exercises,
    "legs",
    level,
  );
  const compoundPool = categoryPool.filter(
    (exercise) => exercise.type === "compound",
  );
  const isolationPool = categoryPool.filter(
    (exercise) => exercise.type === "isolation",
  );
  const isolationCount = week >= 3 ? 3 : 2;

  const compound = pickExercises({
    pool: compoundPool,
    count: 1,
    usedWeekIds,
    blockedMuscleGroups,
    targetPerExerciseCalories: Math.round(
      targetSessionCalories / (1 + isolationCount),
    ),
    week,
  });

  const isolation = pickExercises({
    pool: isolationPool,
    count: isolationCount,
    usedWeekIds,
    blockedMuscleGroups,
    targetPerExerciseCalories: Math.round(
      targetSessionCalories / (1 + isolationCount),
    ),
    week,
  });

  assert(
    compound.length === 1 && isolation.length >= 2,
    "Insufficient legs exercises to satisfy rule set",
  );
  return [...compound, ...isolation];
}

function generateFullBodyDay(args) {
  const { exercises, usedWeekIds, blockedMuscleGroups, level, week } = args;
  const targetSessionCalories = getTargetSessionCalories(level);

  const push = pickExercises({
    pool: filterExercisesByCategoryAndLevel(exercises, "push", level),
    count: 1,
    usedWeekIds,
    blockedMuscleGroups,
    targetPerExerciseCalories: Math.round(targetSessionCalories / 3),
    week,
  });
  const pull = pickExercises({
    pool: filterExercisesByCategoryAndLevel(exercises, "pull", level),
    count: 1,
    usedWeekIds,
    blockedMuscleGroups,
    targetPerExerciseCalories: Math.round(targetSessionCalories / 3),
    week,
  });
  const legs = pickExercises({
    pool: filterExercisesByCategoryAndLevel(exercises, "legs", level),
    count: 1,
    usedWeekIds,
    blockedMuscleGroups,
    targetPerExerciseCalories: Math.round(targetSessionCalories / 3),
    week,
  });

  assert(
    push.length === 1 && pull.length === 1 && legs.length === 1,
    "Insufficient exercises to satisfy full body rule set",
  );
  return [...push, ...pull, ...legs];
}

function buildMainWorkoutByDayType({
  dayType,
  exercises,
  usedWeekIds,
  blockedMuscleGroups,
  week,
  level,
}) {
  if (dayType === "push")
    return generatePushDay({
      exercises,
      usedWeekIds,
      blockedMuscleGroups,
      level,
      week,
    });
  if (dayType === "pull")
    return generatePullDay({
      exercises,
      usedWeekIds,
      blockedMuscleGroups,
      level,
      week,
    });
  if (dayType === "legs")
    return generateLegsDay({
      exercises,
      usedWeekIds,
      blockedMuscleGroups,
      week,
      level,
    });
  if (dayType === "full_body")
    return generateFullBodyDay({
      exercises,
      usedWeekIds,
      blockedMuscleGroups,
      level,
      week,
    });

  return [];
}

function createBlockRecords({ block, exercises, progression, level }) {
  const restSeconds =
    Number.parseInt(
      String(progression.rest || "60").replace(/[^0-9]/g, ""),
      10,
    ) || 60;

  return exercises.map((exercise) => {
    const sets = progression.sets;
    const reps = progression.reps || BASE_REPS[level] || "10-12";
    const mainRestSeconds = progression.circuit ? 0 : restSeconds;

    return {
      exerciseId: String(exercise._id),
      name: exercise.name,
      category: exercise.category,
      muscleGroup: exercise.muscleGroup,
      type: exercise.type,
      block,
      sets,
      reps,
      durationMin: exercise.durationMin,
      restSeconds: block === "mainWorkout" ? mainRestSeconds : restSeconds,
      intensity: progression.intensity,
      volume: `${sets}x${reps}`,
      estimatedCalories: exercise.workoutData?.calories || 0,
    };
  });
}

function splitBlocksWithinLimit(mainWorkout, mobilityPool, usedWeekIds) {
  const maxExercisesPerDay = 5;
  const blocks = {
    warmUp: [],
    mainWorkout,
    cooldown: [],
  };

  if (mainWorkout.length < maxExercisesPerDay) {
    const warm = mobilityPool.find(
      (exercise) => !usedWeekIds.has(exercise._id),
    );
    if (warm) {
      usedWeekIds.add(warm._id);
      blocks.warmUp = [warm];
    }
  }

  if (blocks.warmUp.length + mainWorkout.length < maxExercisesPerDay) {
    const cool = mobilityPool.find(
      (exercise) => !usedWeekIds.has(exercise._id),
    );
    if (cool) {
      usedWeekIds.add(cool._id);
      blocks.cooldown = [cool];
    }
  }

  const total =
    blocks.warmUp.length + blocks.mainWorkout.length + blocks.cooldown.length;
  assert(total <= maxExercisesPerDay, "Daily exercise count exceeds max of 5");
  assert(blocks.mainWorkout.length > 0, "mainWorkout block is required");

  return blocks;
}

function addDays(baseDate, days) {
  const nextDate = new Date(baseDate);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function toDayMonth(dateValue) {
  return {
    day: dateValue.getDate(),
    month: dateValue.getMonth() + 1,
  };
}

function mapResponseDay({ workoutDayDoc, progression, blocks, level }) {
  const toSimple = (items) =>
    items.map((item) => ({
      exerciseId: String(item._id),
      name: item.name,
      category: item.category,
      muscleGroup: item.muscleGroup,
      type: item.type,
      intensity: progression.intensity,
      sets: progression.sets,
      reps: progression.reps || BASE_REPS[level] || "10-12",
      rest: progression.rest || "60s",
      tempo: progression.tempo || "2-0-2",
      circuit: Boolean(progression.circuit),
      circuitRoundRest: progression.circuitRoundRest || "",
      volume: `${progression.sets}x${progression.reps || BASE_REPS[level] || "10-12"}`,
      durationMin: item.durationMin,
      calories: item.workoutData?.calories || 0,
    }));

  return {
    workoutDayId: String(workoutDayDoc._id),
    dayNumber: workoutDayDoc.dayNumber,
    dayType: workoutDayDoc.dayType,
    done: workoutDayDoc.done || false,
    date: workoutDayDoc.date,
    progression,
    warmUp: toSimple(blocks.warmUp),
    mainWorkout: toSimple(blocks.mainWorkout),
    cooldown: toSimple(blocks.cooldown),
  };
}

class TrainingPlanService {
  async generatePlan(payload = {}) {
    const userId = payload.userId;
    const goal = normalizeLower(payload.goal);
    const level = normalizeLower(payload.level);
    const durationWeeks = toInt(payload.durationWeeks, 4);
    const weightKg = Number(payload.weightKg);
    const heightCm = Number(payload.heightCm);
    const age = Number(payload.age);
    const gender = payload.gender;
    const targetWeight = Number(payload.targetWeight);

    assert(userId, "userId is required");
    assert(GOAL_ENUM.includes(goal), "goal is invalid");
    assert(
      LEVEL_ORDER[level],
      "level must be beginner, intermediate, or advanced",
    );
    assert(
      durationWeeks >= 1 && durationWeeks <= 12,
      "durationWeeks must be between 1 and 12",
    );
    assert(Number.isFinite(weightKg) && weightKg > 0, "weightKg is required");
    assert(Number.isFinite(heightCm) && heightCm > 0, "heightCm is required");
    assert(Number.isFinite(age) && age > 0, "age is required");
    assert(
      ["male", "female"].includes(normalizeLower(gender)),
      "gender must be male or female",
    );
    assert(
      Number.isFinite(targetWeight) && targetWeight > 0,
      "targetWeight is required",
    );

    const { bmi, bmi_category, calorieTarget } = calculateMetrics({
      weightKg,
      heightCm,
      age,
      gender: normalizeLower(gender),
      targetWeight,
      level,
    });
    const baseIntensity = getIntensityFromBMI(bmi_category);
    const addCardio = shouldAddCardio(goal, weightKg, targetWeight);

    const user = await User.findById(userId).populate("profile").lean();
    assert(user, "User not found", 404);

    await replaceUserTrainingPlans(userId);

    const preferredSplitType = payload.splitType || user.profile?.splitType;
    let splitType = resolveSplitType(
      preferredSplitType,
      toInt(payload.daysPerWeek, 3),
    );
    let splitPattern = SPLIT_PATTERNS[splitType];

    const eligibleExercises = getEligibleExercises(level);
    assert(
      eligibleExercises.length > 0,
      "No exercises available for this level",
    );

    const pushDaysInPattern = splitPattern.filter(
      (dayType) => dayType === "push",
    ).length;
    const pushPool = getPoolByCategory(eligibleExercises, "push");
    const pushCompoundCount = pushPool.filter(
      (exercise) => exercise.type === "compound",
    ).length;
    const pushIsolationCount = pushPool.filter(
      (exercise) => exercise.type === "isolation",
    ).length;

    if (
      pushDaysInPattern > 0 &&
      (pushCompoundCount < pushDaysInPattern ||
        pushIsolationCount < pushDaysInPattern * 2)
    ) {
      splitType = "full_body";
      splitPattern = SPLIT_PATTERNS[splitType];
    }

    const daysPerWeek = splitPattern.filter(
      (dayType) => dayType !== "rest",
    ).length;

    const mobilityPool = getPoolByCategory(eligibleExercises, "mobility");
    const cardioPool = getPoolByCategory(eligibleExercises, "cardio");
    const plyometricPool = getPlyometricPool(eligibleExercises);
    assert(
      mobilityPool.length > 0,
      "At least one mobility exercise is required",
    );
    if (addCardio) {
      assert(
        cardioPool.length > 0,
        "Cardio pool is required when cardio is enabled",
      );
    }

    const trainingPlan = await TrainingPlan.create({
      userId,
      goal,
      level,
      daysPerWeek,
      splitType,
      durationWeeks,
      targetWeight,
      bmi,
      bmiCategory: bmi_category,
      calorieTarget,
      summary: {
        trainingStyle: splitType,
        daysPerWeek,
        sessionDuration: 45,
      },
      weeklyPlan: [],
      cyclePlan: [],
      progressionPlan: {
        week1: `${getProgression(1, baseIntensity, goal).sets} sets - intensity ${getProgression(1, baseIntensity, goal).intensity}`,
        week2: `${getProgression(2, baseIntensity, goal).sets} sets - intensity ${getProgression(2, baseIntensity, goal).intensity}`,
        week3: `${getProgression(3, baseIntensity, goal).sets} sets - intensity ${getProgression(3, baseIntensity, goal).intensity}`,
        week4: `${getProgression(4, baseIntensity, goal).sets} sets - intensity ${getProgression(4, baseIntensity, goal).intensity}`,
      },
      safetyNotes: [
        "Keep form strict on all compound lifts.",
        "Stop the set if pain appears.",
      ],
    });

    const weeks = [];
    const planStartDate = new Date(trainingPlan.startDate || Date.now());

    for (let week = 1; week <= durationWeeks; week += 1) {
      const progression = getProgression(week, baseIntensity, goal);
      const weekUsedIds = new Set();
      const weekDays = [];
      let previousDayMuscleGroups = new Set();

      for (let dayIndex = 0; dayIndex < splitPattern.length; dayIndex += 1) {
        const dayNumber = dayIndex + 1;
        const dayType = splitPattern[dayIndex];
        const date = toDayMonth(
          addDays(planStartDate, (week - 1) * splitPattern.length + dayIndex),
        );

        const workoutDayDoc = await WorkoutDay.create({
          planId: trainingPlan._id,
          weekNumber: week,
          dayNumber,
          dayType,
        });

        if (dayType === "rest") {
          weekDays.push({
            workoutDayId: String(workoutDayDoc._id),
            dayNumber,
            dayType,
            date,
            progression,
            warmUp: [],
            mainWorkout: [],
            cooldown: [],
          });
          previousDayMuscleGroups = new Set();
          continue;
        }

        const mainWorkout = buildMainWorkoutByDayType({
          dayType,
          exercises: eligibleExercises,
          usedWeekIds: weekUsedIds,
          blockedMuscleGroups: previousDayMuscleGroups,
          week,
          level,
        });

        if (goal === "endurance") {
          const hasPlyometric = mainWorkout.some((exercise) => {
            const name = String(exercise?.name || "").toLowerCase();
            return /(jump squat|squat jump|box jump|burpee|mountain climber|tuck jump|skater jump|high knees)/i.test(
              name,
            );
          });

          if (!hasPlyometric && plyometricPool.length > 0) {
            const plyoPick = pickExercises({
              pool: plyometricPool,
              count: 1,
              usedWeekIds: weekUsedIds,
              blockedMuscleGroups: new Set(),
              targetPerExerciseCalories: Math.round(
                getTargetSessionCalories(level) / 3,
              ),
              week,
            });

            if (plyoPick.length === 1) {
              if (mainWorkout.length >= 4) {
                mainWorkout[mainWorkout.length - 1] = plyoPick[0];
              } else {
                mainWorkout.push(plyoPick[0]);
              }
            }
          }
        }

        if (addCardio) {
          const cardioPick = pickExercises({
            pool: cardioPool,
            count: 1,
            usedWeekIds: weekUsedIds,
            blockedMuscleGroups: new Set(),
            targetPerExerciseCalories: Math.round(
              getTargetSessionCalories(level) / 3,
            ),
            week,
          });
          assert(cardioPick.length === 1, "Unable to add cardio exercise");
          mainWorkout.push({
            ...cardioPick[0],
            durationMin: 10 + week * 2,
          });
        }

        const blocks = splitBlocksWithinLimit(
          mainWorkout,
          mobilityPool,
          weekUsedIds,
        );

        const mainRecords = createBlockRecords({
          block: "mainWorkout",
          exercises: blocks.mainWorkout,
          progression,
          level,
        });
        const warmRecords = createBlockRecords({
          block: "warmUp",
          exercises: blocks.warmUp,
          progression,
          level,
        });
        const cooldownRecords = createBlockRecords({
          block: "cooldown",
          exercises: blocks.cooldown,
          progression,
          level,
        });

        const allRecords = [
          ...warmRecords,
          ...mainRecords,
          ...cooldownRecords,
        ].map((record) => ({
          ...record,
          planId: trainingPlan._id,
          workoutDayId: workoutDayDoc._id,
        }));

        assert(allRecords.length <= 5, "Max 5 exercises per day exceeded");

        await DayExercise.insertMany(allRecords);

        previousDayMuscleGroups = new Set(
          blocks.mainWorkout.map((exercise) => exercise.muscleGroup),
        );

        weekDays.push(
          mapResponseDay({
            workoutDayDoc: { ...workoutDayDoc.toObject(), date },
            progression,
            blocks,
            level,
          }),
        );
      }

      weeks.push({
        weekNumber: week,
        progression,
        days: weekDays,
      });
    }

    return {
      planId: String(trainingPlan._id),
      userId: String(userId),
      goal,
      level,
      splitType,
      daysPerWeek,
      durationWeeks,
      bmi,
      bmiCategory: bmi_category,
      calorieTarget,
      weeks,
    };
  }

  async getPlanById(planId) {
    assert(planId, "planId is required");

    const trainingPlan = await TrainingPlan.findById(planId).lean();
    if (!trainingPlan) {
      const error = new Error("Training plan not found");
      error.status = 404;
      throw error;
    }

    const [workoutDays, exercises] = await Promise.all([
      WorkoutDay.find({ planId: trainingPlan._id })
        .sort({ weekNumber: 1, dayNumber: 1 })
        .lean(),
      DayExercise.find({ planId: trainingPlan._id })
        .sort({ createdAt: 1 })
        .lean(),
    ]);

    const exercisesByWorkoutDay = exercises.reduce((accumulator, item) => {
      const key = String(item.workoutDayId);
      if (!accumulator[key]) {
        accumulator[key] = { warmUp: [], mainWorkout: [], cooldown: [] };
      }
      if (accumulator[key][item.block]) {
        accumulator[key][item.block].push(item);
      }
      return accumulator;
    }, {});

    const weeks = [];
    const weekMap = new Map();
    const planStartDate = new Date(
      trainingPlan.startDate || trainingPlan.createdAt || Date.now(),
    );
    let dayOffset = 0;

    for (const workoutDay of workoutDays) {
      const groupedBlocks = exercisesByWorkoutDay[String(workoutDay._id)] || {
        warmUp: [],
        mainWorkout: [],
        cooldown: [],
      };
      const date = toDayMonth(addDays(planStartDate, dayOffset));
      dayOffset += 1;

      const dayResponse = {
        workoutDayId: String(workoutDay._id),
        dayNumber: workoutDay.dayNumber,
        dayType: workoutDay.dayType,
        done: workoutDay.done || false,
        date,
        warmUp: groupedBlocks.warmUp,
        mainWorkout: groupedBlocks.mainWorkout,
        cooldown: groupedBlocks.cooldown,
      };

      if (!weekMap.has(workoutDay.weekNumber)) {
        weekMap.set(workoutDay.weekNumber, {
          weekNumber: workoutDay.weekNumber,
          days: [],
        });
        weeks.push(weekMap.get(workoutDay.weekNumber));
      }

      weekMap.get(workoutDay.weekNumber).days.push(dayResponse);
    }

    return {
      planId: String(trainingPlan._id),
      userId: String(trainingPlan.userId),
      goal: trainingPlan.goal,
      level: trainingPlan.level,
      splitType: trainingPlan.splitType,
      daysPerWeek: trainingPlan.daysPerWeek,
      durationWeeks: trainingPlan.durationWeeks,
      bmi: trainingPlan.bmi,
      bmiCategory: trainingPlan.bmiCategory,
      calorieTarget: trainingPlan.calorieTarget,
      weeks,
    };
  }

  async getLatestPlanByUserId(userId) {
    assert(userId, "userId is required");

    const latestPlan = await TrainingPlan.findOne({ userId })
      .sort({ createdAt: -1 })
      .lean();

    if (!latestPlan) {
      const error = new Error("Training plan not found for this user");
      error.status = 404;
      throw error;
    }

    return this.getPlanById(latestPlan._id);
  }

  async markWorkoutDayAsDone(workoutDayId, isDone = true) {
    assert(workoutDayId, "workoutDayId is required");

    const workoutDay = await WorkoutDay.findByIdAndUpdate(
      workoutDayId,
      { done: isDone },
      { new: true },
    );

    if (!workoutDay) {
      const error = new Error("Workout day not found");
      error.status = 404;
      throw error;
    }

    return {
      message: `Workout day marked as ${isDone ? "done" : "not done"}`,
      workoutDay: {
        workoutDayId: String(workoutDay._id),
        dayNumber: workoutDay.dayNumber,
        dayType: workoutDay.dayType,
        done: workoutDay.done,
      },
    };
  }
}

module.exports = new TrainingPlanService();
module.exports.LEVEL_ORDER = LEVEL_ORDER;
module.exports.getProgression = getProgression;
module.exports.getIntensityFromBMI = getIntensityFromBMI;
module.exports.shouldAddCardio = shouldAddCardio;
