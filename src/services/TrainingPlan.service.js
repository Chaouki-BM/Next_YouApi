const trainingExerciseLibrary = require("../utils/trainingExerciseLibrary");
const TrainingPlan = require("../models/TrainingPlan.model");

const LEVEL_ORDER = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
};

const WEEKLY_FOCUS = {
  3: ["push", "legs", "pull"],
  4: ["push", "legs", "pull", "full_body"],
  5: ["push", "legs", "pull", "core", "full_body"],
  6: ["push", "pull", "legs", "push", "pull", "legs"],
};

const REST_BY_LEVEL = {
  beginner: "60-90s",
  intermediate: "45-60s",
  advanced: "30-45s",
};

const SETS_BY_LEVEL = {
  beginner: 2,
  intermediate: 3,
  advanced: 4,
};

const REPS_BY_LEVEL = {
  beginner: "10-12",
  intermediate: "10-15",
  advanced: "8-12",
};

const GOAL_RATIOS = {
  weight_loss: { strength: 0.5, cardio: 0.4, core: 0.1 },
  strength: { strength: 0.7, cardio: 0.1, core: 0.2 },
  endurance: { strength: 0.3, cardio: 0.6, core: 0.1 },
  flexibility: { strength: 0, cardio: 0, core: 0 },
  recovery: { strength: 0, cardio: 0, core: 0 },
};

const DIFFICULTY_ORDER = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
};

const WEEK_PHASES = [
  {
    week: 1,
    label: "baseline",
    title: "Baseline",
    setsDelta: 0,
    restWeek: 1,
    calorieMultiplier: 1,
    exerciseMode: "stable",
    progressionNote: "Establish form, pacing, and recovery habits.",
  },
  {
    week: 2,
    label: "build",
    title: "Build",
    setsDelta: 1,
    restWeek: 2,
    calorieMultiplier: 1.05,
    exerciseMode: "variation",
    progressionNote: "Add a small volume bump and rotate in a new variation.",
  },
  {
    week: 3,
    label: "intensify",
    title: "Intensify",
    setsDelta: 1,
    restWeek: 3,
    calorieMultiplier: 1.1,
    exerciseMode: "upgrade",
    progressionNote: "Use slightly harder selections and tighter rest.",
  },
  {
    week: 4,
    label: "deload",
    title: "Deload",
    setsDelta: -1,
    restWeek: 4,
    calorieMultiplier: 0.9,
    exerciseMode: "recover",
    progressionNote:
      "Reduce load so the body can recover before the next block.",
  },
];

const GOAL_WEEKLY_RATES = {
  weight_loss: { beginner: 0.5, intermediate: 0.65, advanced: 0.75 },
  strength: { beginner: 0.35, intermediate: 0.45, advanced: 0.55 },
  endurance: { beginner: 0.4, intermediate: 0.5, advanced: 0.6 },
  flexibility: { beginner: 0.25, intermediate: 0.3, advanced: 0.35 },
  recovery: { beginner: 0.2, intermediate: 0.25, advanced: 0.3 },
};

const REST_VARIANTS = {
  beginner: ["60-90s", "55-75s", "45-60s", "75-90s"],
  intermediate: ["45-60s", "40-55s", "35-45s", "50-60s"],
  advanced: ["30-45s", "30-40s", "25-35s", "35-45s"],
};

function difficultyScore(value) {
  return DIFFICULTY_ORDER[toLower(value)] || 0;
}

function getPhaseConfig(weekNumber) {
  return (
    WEEK_PHASES.find((phase) => phase.week === weekNumber) || WEEK_PHASES[0]
  );
}

function getRestForPhase(level, weekNumber) {
  const restSet = REST_VARIANTS[level] || REST_VARIANTS.beginner;
  return (
    restSet[weekNumber - 1] || REST_BY_LEVEL[level] || REST_BY_LEVEL.beginner
  );
}

function getRepsForPhase(goal, weekNumber) {
  if (goal === "flexibility" || goal === "recovery") {
    return "30-45s hold";
  }

  if (goal === "strength") {
    if (weekNumber === 3) return "6-10";
    if (weekNumber === 4) return "8-10";
    return "8-12";
  }

  if (goal === "endurance") {
    if (weekNumber === 2) return "12-16";
    if (weekNumber === 3) return "14-18";
    if (weekNumber === 4) return "10-14";
    return "10-15";
  }

  if (goal === "weight_loss") {
    if (weekNumber === 3) return "10-15";
    if (weekNumber === 4) return "8-12";
    return "10-12";
  }

  return REPS_BY_LEVEL.beginner;
}

function getMainWorkoutSets(goal, level, phase) {
  const baseSets =
    goal === "flexibility" || goal === "recovery" ? 2 : SETS_BY_LEVEL[level];
  const setsDelta = toNumber(phase?.setsDelta, 0);

  if (goal === "flexibility" || goal === "recovery") {
    return Math.max(2, baseSets + Math.min(0, setsDelta));
  }

  return Math.max(1, baseSets + setsDelta);
}

function pickComparator(phase) {
  if (phase.exerciseMode === "recover") {
    return (a, b) => {
      const difficultyDelta =
        difficultyScore(a.difficulty) - difficultyScore(b.difficulty);
      if (difficultyDelta !== 0) return difficultyDelta;
      return (
        a.durationMin - b.durationMin ||
        String(a.name).localeCompare(String(b.name))
      );
    };
  }

  if (phase.exerciseMode === "variation" || phase.exerciseMode === "upgrade") {
    return (a, b) => {
      const difficultyDelta =
        difficultyScore(b.difficulty) - difficultyScore(a.difficulty);
      if (difficultyDelta !== 0) return difficultyDelta;
      return (
        a.durationMin - b.durationMin ||
        String(a.name).localeCompare(String(b.name))
      );
    };
  }

  return (a, b) =>
    a.durationMin - b.durationMin ||
    String(a.name).localeCompare(String(b.name));
}

function estimateGoalTimeline(user, goal, level) {
  const currentWeight = toNumber(
    user.currentWeight ??
      user.current_weight ??
      user.weight ??
      user.startWeight ??
      user.profile?.current_weight ??
      user.profile?.weight,
    NaN,
  );
  const targetWeight = toNumber(
    user.targetWeight ??
      user.target_weight ??
      user.goalWeight ??
      user.goal_weight ??
      user.profile?.target_weight ??
      user.profile?.goal_weight,
    NaN,
  );
  const hasWeightData =
    Number.isFinite(currentWeight) &&
    currentWeight > 0 &&
    Number.isFinite(targetWeight) &&
    targetWeight > 0 &&
    currentWeight !== targetWeight;

  const weeklyRate =
    GOAL_WEEKLY_RATES[goal]?.[level] || GOAL_WEEKLY_RATES.weight_loss.beginner;
  const fallbackWeeks = goal === "flexibility" || goal === "recovery" ? 4 : 8;
  const estimatedWeeks = hasWeightData
    ? Math.max(
        1,
        Math.ceil(
          Math.abs(currentWeight - targetWeight) / Math.max(0.1, weeklyRate),
        ),
      )
    : fallbackWeeks;
  const estimatedMonths = Number((estimatedWeeks / 4.345).toFixed(1));

  return {
    currentWeight: Number.isFinite(currentWeight) ? currentWeight : null,
    targetWeight: Number.isFinite(targetWeight) ? targetWeight : null,
    weeklyRateKg: weeklyRate,
    estimatedWeeks,
    estimatedMonths,
    estimatedReviewDate: new Date(
      Date.now() + estimatedWeeks * 7 * 24 * 60 * 60 * 1000,
    ),
    reviewEveryWeeks: 4,
    note: hasWeightData
      ? "Estimate based on the current weight and target weight provided by the user."
      : "Estimate based on a standard 4-week training block because weight data is incomplete.",
  };
}

function pickAlternativeExercise({
  currentExercise,
  pool,
  usedIds,
  phase,
  level,
}) {
  if (!currentExercise) {
    return null;
  }

  const currentDifficulty = difficultyScore(currentExercise.difficulty);
  const sameCategory = pool.filter(
    (exercise) =>
      exercise.category === currentExercise.category &&
      exercise.exerciseId !== currentExercise.exerciseId,
  );

  const ordered = [...sameCategory].sort(pickComparator(phase));

  let desiredDifficulty = currentDifficulty;
  if (phase.exerciseMode === "upgrade") {
    desiredDifficulty = Math.min(
      currentDifficulty + 1,
      LEVEL_ORDER[level] || currentDifficulty,
    );
  } else if (phase.exerciseMode === "recover") {
    desiredDifficulty = Math.max(1, currentDifficulty - 1);
  }

  const exactMatch = ordered.find((exercise) => {
    const score = difficultyScore(exercise.difficulty);
    return !usedIds.has(exercise.exerciseId) && score === desiredDifficulty;
  });

  if (exactMatch) {
    usedIds.add(exactMatch.exerciseId);
    return exactMatch;
  }

  const compatibleMatch = ordered.find((exercise) => {
    const score = difficultyScore(exercise.difficulty);
    if (phase.exerciseMode === "upgrade") return score >= desiredDifficulty;
    if (phase.exerciseMode === "recover") return score <= currentDifficulty;
    return score === currentDifficulty;
  });

  if (compatibleMatch) {
    usedIds.add(compatibleMatch.exerciseId);
    return compatibleMatch;
  }

  const fallback =
    ordered.find((exercise) => !usedIds.has(exercise.exerciseId)) || ordered[0];
  if (fallback) {
    usedIds.add(fallback.exerciseId);
    return fallback;
  }

  return currentExercise;
}

function adjustWorkoutItem(
  item,
  phase,
  level,
  goal,
  exerciseLookup,
  pool,
  usedIds,
) {
  const currentExercise = exerciseLookup.get(String(item.exerciseId));
  const nextExercise = pickAlternativeExercise({
    currentExercise,
    pool,
    usedIds,
    phase,
    level,
  });

  const adjusted = {
    ...item,
    sets: getMainWorkoutSets(goal, level, phase.week),
    reps: getRepsForPhase(goal, phase.week),
    rest: getRestForPhase(level, phase.week),
  };

  if (nextExercise) {
    adjusted.exerciseId = nextExercise.exerciseId;
    adjusted.name = nextExercise.name;
    adjusted.category = nextExercise.category;
  }

  return adjusted;
}

function buildCyclePlan({ weeklyPlan, exerciseLookup, pool, level, goal }) {
  return WEEK_PHASES.map((phase) => ({
    week: phase.week,
    label: phase.title,
    progressionNote: phase.progressionNote,
    days: weeklyPlan.map((dayPlan) => {
      const usedIds = new Set();
      const mainWorkout = dayPlan.mainWorkout.map((item) =>
        adjustWorkoutItem(
          item,
          phase,
          level,
          goal,
          exerciseLookup,
          pool,
          usedIds,
        ),
      );

      return {
        ...dayPlan,
        week: phase.week,
        phase: phase.label,
        mainWorkout,
        estimatedCalories: Math.round(
          toNumber(dayPlan.estimatedCalories, 0) * phase.calorieMultiplier,
        ),
      };
    }),
  }));
}

function toLower(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeTrainingUser(user = {}) {
  const profile = user.profile || {};
  const workoutDays = Array.isArray(user.workout_days)
    ? user.workout_days
    : Array.isArray(profile.workout_days)
      ? profile.workout_days
      : [];

  return {
    ...user,
    userId: user.userId ?? user.id ?? user._id,
    focus:
      user.focus ?? user.focus_goal ?? profile.focus_goal ?? profile.goal ?? "",
    level:
      user.level ??
      user.experience_level ??
      profile.experience_level ??
      profile.activity_level_lifestyle ??
      "",
    daysPerWeek:
      user.daysPerWeek ??
      user.days_per_week ??
      profile.daysPerWeek ??
      profile.session_days ??
      (workoutDays.length > 0 ? workoutDays.length : undefined),
    sessionDuration:
      user.sessionDuration ??
      user.session_duration ??
      profile.session_duration ??
      profile.preferred_session_duration,
    currentWeight:
      user.currentWeight ??
      user.current_weight ??
      profile.current_weight ??
      profile.weight,
    targetWeight:
      user.targetWeight ??
      user.target_weight ??
      profile.target_weight ??
      profile.goal_weight,
    health:
      user.health ??
      (profile.injury_notes
        ? {
            knees: profile.injury_notes.toLowerCase().includes("knee"),
            back: profile.injury_notes.toLowerCase().includes("back"),
            shoulder: profile.injury_notes.toLowerCase().includes("shoulder"),
          }
        : {}),
  };
}

function normalizeCategory(exercise) {
  const fromCategory = toLower(exercise?.category);
  if (
    ["push", "pull", "legs", "core", "cardio", "mobility"].includes(
      fromCategory,
    )
  ) {
    return fromCategory;
  }

  const fromFocus = toLower(exercise?.focus);
  if (
    ["push", "pull", "legs", "core", "cardio", "mobility"].includes(fromFocus)
  ) {
    return fromFocus;
  }

  return "";
}

function isExerciseSafeForHealth(exerciseName, health = {}) {
  const name = String(exerciseName || "").toLowerCase();

  if (health.knees) {
    if (/(squat|lunge|jump|leg press)/i.test(name)) return false;
  }

  if (health.back) {
    if (/(deadlift|bent[-\s]?over row|sit-?up)/i.test(name)) return false;
  }

  if (health.shoulder) {
    if (/(overhead press|pull-?up|dip)/i.test(name)) return false;
  }

  return true;
}

function isAllowedByLevel(exercise, userLevel) {
  const exerciseLevel = toLower(exercise?.difficulty);
  if (!LEVEL_ORDER[exerciseLevel] || !LEVEL_ORDER[userLevel]) return false;
  return LEVEL_ORDER[exerciseLevel] <= LEVEL_ORDER[userLevel];
}

function isAllowedForBeginnerStyle(exerciseName, userLevel) {
  if (userLevel !== "beginner") return true;
  const name = String(exerciseName || "").toLowerCase();
  return !/(jump|plyo|burpee|explosive|sprint|box jump)/i.test(name);
}

function getWeeklyFocus(daysPerWeek) {
  const pattern = WEEKLY_FOCUS[toNumber(daysPerWeek)] || WEEKLY_FOCUS[3];
  return [...pattern];
}

function buildExerciseRecord(exercise) {
  return {
    exerciseId: String(exercise._id),
    name: String(exercise.name || ""),
    category: normalizeCategory(exercise),
    difficulty: toLower(exercise.difficulty),
    durationMin: Math.max(1, toNumber(exercise.durationMin, 1)),
    calories: Math.max(0, toNumber(exercise?.workoutData?.calories, 0)),
  };
}

function pickByTargetMinutes(options, targetMinutes, usedIds, comparator) {
  const sorted = [...options].sort(
    comparator || ((a, b) => a.durationMin - b.durationMin),
  );
  const picked = [];
  let total = 0;

  for (const ex of sorted) {
    if (usedIds.has(ex.exerciseId)) continue;
    if (total + ex.durationMin > targetMinutes) continue;
    picked.push(ex);
    usedIds.add(ex.exerciseId);
    total += ex.durationMin;
    if (total >= targetMinutes) break;
  }

  // If unique selection cannot reach the target, allow reuse to respect duration rules.
  if (total < targetMinutes && sorted.length > 0) {
    let safety = 0;
    while (total < targetMinutes && safety < 20) {
      const reusable = sorted.find(
        (ex) => total + ex.durationMin <= targetMinutes,
      );
      if (!reusable) break;
      picked.push(reusable);
      total += reusable.durationMin;
      safety += 1;
    }
  }

  if (picked.length === 0) {
    const fallback =
      sorted.find((ex) => !usedIds.has(ex.exerciseId)) || sorted[0];
    if (fallback) {
      picked.push(fallback);
      usedIds.add(fallback.exerciseId);
      total += fallback.durationMin;
    }
  }

  return { picked, total };
}

function pickSingleDuration(
  options,
  minMinutes,
  maxMinutes,
  usedIds,
  comparator,
) {
  const sorted = [...options].sort(
    comparator || ((a, b) => a.durationMin - b.durationMin),
  );
  for (const ex of sorted) {
    if (usedIds.has(ex.exerciseId)) continue;
    if (ex.durationMin >= minMinutes && ex.durationMin <= maxMinutes) {
      usedIds.add(ex.exerciseId);
      return ex;
    }
  }

  // Reuse is allowed if unique picks are exhausted.
  for (const ex of sorted) {
    if (ex.durationMin >= minMinutes && ex.durationMin <= maxMinutes) {
      usedIds.add(ex.exerciseId);
      return ex;
    }
  }

  for (const ex of sorted) {
    if (usedIds.has(ex.exerciseId)) continue;
    if (ex.durationMin <= maxMinutes) {
      usedIds.add(ex.exerciseId);
      return ex;
    }
  }

  for (const ex of sorted) {
    if (ex.durationMin <= maxMinutes) {
      usedIds.add(ex.exerciseId);
      return ex;
    }
  }

  return null;
}

function mapMainWorkout(exercises, level, goal, phase = WEEK_PHASES[0]) {
  const sets =
    goal === "flexibility" || goal === "recovery" ? 2 : SETS_BY_LEVEL[level];
  const reps =
    goal === "flexibility" || goal === "recovery"
      ? "30-45s hold"
      : REPS_BY_LEVEL[level];
  const rest = getRestForPhase(level, phase.week);

  return exercises.map((ex) => ({
    exerciseId: ex.exerciseId,
    name: ex.name,
    category: ex.category,
    sets: getMainWorkoutSets(goal, level, phase.week) || sets,
    reps: getRepsForPhase(goal, phase.week) || reps,
    rest,
  }));
}

function mapDurationItems(exercises) {
  return exercises.map((ex) => ({
    exerciseId: ex.exerciseId,
    name: ex.name,
    duration: `${ex.durationMin} min`,
  }));
}

function ensureValidInput(payload) {
  const user = normalizeTrainingUser(payload?.user);

  if (!user) {
    const err = new Error("Input must include user object");
    err.status = 400;
    throw err;
  }

  if (!user.userId) {
    const err = new Error("user.userId is required");
    err.status = 400;
    throw err;
  }

  const days = toNumber(user.daysPerWeek, 0);
  if (![3, 4, 5, 6].includes(days)) {
    const err = new Error("daysPerWeek must be one of: 3, 4, 5, 6");
    err.status = 400;
    throw err;
  }

  const duration = toNumber(user.sessionDuration, 0);
  if (duration < 15) {
    const err = new Error("sessionDuration must be at least 15 minutes");
    err.status = 400;
    throw err;
  }

  const level = toLower(user.level);
  if (!LEVEL_ORDER[level]) {
    const err = new Error(
      "user.level must be beginner, intermediate, or advanced",
    );
    err.status = 400;
    throw err;
  }

  const goal = toLower(user.focus);
  if (!GOAL_RATIOS[goal]) {
    const err = new Error(
      "user.focus must be weight_loss, strength, endurance, flexibility, or recovery",
    );
    err.status = 400;
    throw err;
  }
}

class TrainingPlanService {
  generatePlan(payload) {
    ensureValidInput(payload);

    const user = normalizeTrainingUser(payload.user);
    const level = toLower(user.level);
    const goal = toLower(user.focus);
    const sessionDuration = toNumber(user.sessionDuration, 30);
    const daysPerWeek = toNumber(user.daysPerWeek, 3);

    const sourceExercises =
      Array.isArray(payload?.exercises) && payload.exercises.length
        ? payload.exercises
        : trainingExerciseLibrary;

    const candidateExercises = sourceExercises
      .map(buildExerciseRecord)
      .filter((ex) => ex.exerciseId && ex.name && ex.category)
      .filter((ex) => isAllowedByLevel(ex, level))
      .filter((ex) => isAllowedForBeginnerStyle(ex.name, level))
      .filter((ex) => isExerciseSafeForHealth(ex.name, user.health || {}));

    if (candidateExercises.length === 0) {
      const err = new Error(
        "No eligible exercises available after safety and level filtering",
      );
      err.status = 400;
      throw err;
    }

    const byCategory = {
      push: candidateExercises.filter((e) => e.category === "push"),
      pull: candidateExercises.filter((e) => e.category === "pull"),
      legs: candidateExercises.filter((e) => e.category === "legs"),
      core: candidateExercises.filter((e) => e.category === "core"),
      cardio: candidateExercises.filter((e) => e.category === "cardio"),
      mobility: candidateExercises.filter((e) => e.category === "mobility"),
    };

    if (byCategory.mobility.length === 0) {
      const err = new Error(
        "At least one mobility exercise is required for warm-up/cooldown",
      );
      err.status = 400;
      throw err;
    }

    const strengthPool = [
      ...byCategory.push,
      ...byCategory.pull,
      ...byCategory.legs,
    ];
    if (
      ["weight_loss", "strength", "endurance"].includes(goal) &&
      (strengthPool.length === 0 || byCategory.core.length === 0)
    ) {
      const err = new Error(
        "Insufficient strength/core exercises for selected goal",
      );
      err.status = 400;
      throw err;
    }

    if (
      ["weight_loss", "strength", "endurance"].includes(goal) &&
      byCategory.cardio.length === 0
    ) {
      const err = new Error("Cardio exercises are required for selected goal");
      err.status = 400;
      throw err;
    }

    const focusPattern = getWeeklyFocus(daysPerWeek);
    const ratios = GOAL_RATIOS[goal];

    const weeklyPlan = [];

    for (let i = 0; i < focusPattern.length; i += 1) {
      const day = i + 1;
      const focus = focusPattern[i];
      const usedIds = new Set();

      const warmUpExercise = pickSingleDuration(
        byCategory.mobility,
        5,
        10,
        usedIds,
      );
      if (!warmUpExercise) {
        const err = new Error(
          "Unable to build warm-up section from available exercises",
        );
        err.status = 400;
        throw err;
      }

      const cooldownExercise =
        pickSingleDuration(byCategory.mobility, 5, 6, usedIds) ||
        warmUpExercise;
      if (!usedIds.has(cooldownExercise.exerciseId)) {
        usedIds.add(cooldownExercise.exerciseId);
      }

      const baseMinutes =
        warmUpExercise.durationMin + cooldownExercise.durationMin;
      const cardioTarget = ["weight_loss", "strength", "endurance"].includes(
        goal,
      )
        ? Math.max(6, Math.round(sessionDuration * ratios.cardio))
        : 0;

      const remainingForMainAndCardio = Math.max(
        0,
        sessionDuration - baseMinutes,
      );
      const cardioBudget = Math.min(cardioTarget, remainingForMainAndCardio);
      let mainBudget = Math.max(0, remainingForMainAndCardio - cardioBudget);

      if (mainBudget === 0 && remainingForMainAndCardio > 0) {
        mainBudget = remainingForMainAndCardio;
      }

      let dailyMainPool = strengthPool;
      if (focus === "push") dailyMainPool = byCategory.push;
      if (focus === "pull") dailyMainPool = byCategory.pull;
      if (focus === "legs") dailyMainPool = byCategory.legs;
      if (focus === "core") dailyMainPool = byCategory.core;
      if (focus === "full_body")
        dailyMainPool = [...strengthPool, ...byCategory.core];

      if (goal === "flexibility" || goal === "recovery") {
        dailyMainPool = byCategory.mobility;
      }

      const mainExercises = [];
      let mainMinutes = 0;

      if (goal === "flexibility" || goal === "recovery") {
        const pickedMain = pickByTargetMinutes(
          dailyMainPool,
          mainBudget,
          usedIds,
        );
        mainExercises.push(...pickedMain.picked);
        mainMinutes += pickedMain.total;
      } else {
        const nonCardioTotal = ratios.strength + ratios.core;
        const strengthShare =
          nonCardioTotal > 0 ? ratios.strength / nonCardioTotal : 0.5;
        const coreShare =
          nonCardioTotal > 0 ? ratios.core / nonCardioTotal : 0.5;

        const strengthTarget = Math.max(
          1,
          Math.round(mainBudget * strengthShare),
        );
        const coreTarget = Math.max(1, mainBudget - strengthTarget);

        const strengthFromFocus = pickByTargetMinutes(
          dailyMainPool,
          strengthTarget,
          usedIds,
        );
        mainExercises.push(...strengthFromFocus.picked);
        mainMinutes += strengthFromFocus.total;

        const corePick = pickByTargetMinutes(
          byCategory.core,
          coreTarget,
          usedIds,
        );
        mainExercises.push(...corePick.picked);
        mainMinutes += corePick.total;

        const hasCoreInMain = mainExercises.some(
          (item) => item.category === "core",
        );
        if (!hasCoreInMain && byCategory.core.length > 0) {
          const forcedCore = pickByTargetMinutes(byCategory.core, 1, usedIds);
          if (forcedCore.picked.length > 0) {
            mainExercises.push(...forcedCore.picked);
            mainMinutes += forcedCore.total;
          }
        }

        if (mainMinutes < mainBudget) {
          const extraStrength = pickByTargetMinutes(
            strengthPool,
            mainBudget - mainMinutes,
            usedIds,
          );
          mainExercises.push(...extraStrength.picked);
          mainMinutes += extraStrength.total;
        }
      }

      const cardioExercises = [];
      let cardioMinutes = 0;
      if (
        ["weight_loss", "strength", "endurance"].includes(goal) &&
        cardioBudget > 0
      ) {
        const cardioPick = pickByTargetMinutes(
          byCategory.cardio,
          cardioBudget,
          usedIds,
        );
        cardioExercises.push(...cardioPick.picked);
        cardioMinutes += cardioPick.total;
      }

      let totalDuration =
        warmUpExercise.durationMin +
        cooldownExercise.durationMin +
        mainMinutes +
        cardioMinutes;

      if (
        totalDuration > sessionDuration &&
        goal !== "flexibility" &&
        goal !== "recovery"
      ) {
        const nonCoreIndex = mainExercises.findIndex(
          (item) => item.category !== "core",
        );
        const coreIndex = mainExercises.findIndex(
          (item) => item.category === "core",
        );
        if (nonCoreIndex >= 0 && coreIndex >= 0 && nonCoreIndex !== coreIndex) {
          const removed = mainExercises.splice(nonCoreIndex, 1)[0];
          mainMinutes -= removed.durationMin;
          totalDuration -= removed.durationMin;
        }
      }

      if (mainExercises.length === 0) {
        const err = new Error(
          "Unable to build main workout with provided exercises and duration",
        );
        err.status = 400;
        throw err;
      }

      if (
        ["weight_loss", "strength", "endurance"].includes(goal) &&
        cardioExercises.length === 0
      ) {
        const err = new Error(
          "Unable to build cardio section with provided exercises and duration",
        );
        err.status = 400;
        throw err;
      }

      if (totalDuration < sessionDuration - 5) {
        const gap = Math.min(sessionDuration - totalDuration, 5);
        const fillerPool =
          goal === "flexibility" || goal === "recovery"
            ? byCategory.mobility
            : [...strengthPool, ...byCategory.core];
        const filler = pickByTargetMinutes(fillerPool, gap, usedIds);
        if (filler.picked.length) {
          mainExercises.push(...filler.picked);
          mainMinutes += filler.total;
          totalDuration += filler.total;
        }
      }

      if (totalDuration > sessionDuration) {
        const err = new Error(
          "Unable to satisfy session duration limit with provided exercises",
        );
        err.status = 400;
        throw err;
      }

      if (totalDuration < sessionDuration - 5) {
        const err = new Error(
          "Unable to satisfy session duration range (sessionDuration ±5) with provided exercises",
        );
        err.status = 400;
        throw err;
      }

      const estimatedCalories = [
        warmUpExercise,
        cooldownExercise,
        ...mainExercises,
        ...cardioExercises,
      ].reduce((sum, ex) => sum + toNumber(ex.calories, 0), 0);

      weeklyPlan.push({
        day,
        focus,
        warmUp: mapDurationItems([warmUpExercise]),
        mainWorkout: mapMainWorkout(mainExercises, level, goal),
        cardio: mapDurationItems(cardioExercises),
        cooldown: mapDurationItems([cooldownExercise]),
        duration: totalDuration,
        estimatedCalories,
      });
    }

    const exerciseLookup = new Map(
      candidateExercises.map((exercise) => [
        String(exercise.exerciseId),
        exercise,
      ]),
    );
    const cyclePlan = buildCyclePlan({
      weeklyPlan,
      exerciseLookup,
      pool: candidateExercises,
      level,
      goal,
    });
    const goalTimeline = estimateGoalTimeline(user, goal, level);

    const safetyNotes = [
      "Stop immediately if pain, dizziness, or unusual discomfort appears.",
      "Maintain form quality and controlled tempo for every set.",
      `Rest ${REST_BY_LEVEL[level]} between sets as prescribed for your level.`,
    ];

    if (user?.health?.knees) {
      safetyNotes.push(
        "Knee-sensitive movements were excluded (squats, lunges, jumps, leg press).",
      );
    }
    if (user?.health?.back) {
      safetyNotes.push(
        "Back-sensitive movements were excluded (deadlifts, bent-over rows, sit-ups).",
      );
    }
    if (user?.health?.shoulder) {
      safetyNotes.push(
        "Shoulder-sensitive movements were excluded (overhead press, pull-ups, dips).",
      );
    }

    return {
      userId: String(user.userId),
      goal,
      level,
      targetWeight: toNumber(user.targetWeight, 0),
      summary: {
        trainingStyle:
          goal === "weight_loss"
            ? "fat-loss hybrid"
            : goal === "strength"
              ? "strength progression"
              : goal === "endurance"
                ? "cardio-endurance"
                : "mobility-recovery",
        daysPerWeek,
        sessionDuration,
      },
      weeklyPlan,
      cyclePlan,
      goalTimeline,
      progressionPlan: {
        week1: "Establish baseline technique and consistent pacing.",
        week2:
          "Increase volume slightly and rotate a similar movement variation.",
        week3: "Raise effort with tighter rest control and cleaner execution.",
        week4: "Deload intensity by 10-15% while preserving movement quality.",
      },
      safetyNotes,
    };
  }

  async savePlan(planData) {
    const payload = {
      ...planData,
      startDate: new Date(),
      durationWeeks: 4,
    };

    return TrainingPlan.create(payload);
  }
}

module.exports = new TrainingPlanService();
