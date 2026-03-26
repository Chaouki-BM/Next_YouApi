const MET_VALUES = {
  Squat: 5.0,
  Deadlift: 6.0,
  Lunge: 4.5,
  Pushup: 4.0,
  Row: 4.5,
  Curl: 3.5,
  Plank: 3.0,
};

const SECONDS_PER_REP = {
  Squat: 3,
  Deadlift: 4,
  Lunge: 3,
  Pushup: 2,
  Row: 3,
  Curl: 3,
  plank: 1,
};

const getMetValue = (exerciseName) => {
  if (!exerciseName) return null;
  const key = String(exerciseName).trim().toLowerCase();
  return MET_VALUES[key] ?? null;
};

const getSecondsPerRep = (exerciseName) => {
  if (!exerciseName) return null;
  const key = String(exerciseName).trim().toLowerCase();
  return SECONDS_PER_REP[key] ?? null;
};

const calculateDurationMinutesFromReps = ({ exerciseName, reps }) => {
  const secondsPerRep = getSecondsPerRep(exerciseName);
  if (!secondsPerRep) return 0;

  const parsedReps = Number(reps);

  // always estimate from reps × seconds per rep
  const totalSeconds = secondsPerRep * Math.max(parsedReps || 0, 0);

  return Number((totalSeconds / 60).toFixed(4));
};

const calculateCalories = ({ met, weightKg, durationMinutes }) => {
  const metValue = Number(met);
  const weight = Number(weightKg);
  const minutes = Number(durationMinutes);

  if (Number.isNaN(metValue) || metValue <= 0) {
    console.warn(`[Calories] Invalid MET value: ${met}`);
    return 0;
  }
  if (Number.isNaN(weight) || weight <= 0 || weight > 300) {
    console.warn(`[Calories] Invalid weightKg: ${weightKg}`);
    return 0;
  }
  if (Number.isNaN(minutes) || minutes <= 0) {
    console.warn(`[Calories] Invalid durationMinutes: ${durationMinutes}`);
    return 0;
  }

  // formula: (MET × weight_kg × duration_minutes) / 60
  const calories = (metValue * weight * minutes) / 60;
  return Number(calories.toFixed(2));
};

const calculateCaloriesByExercise = ({
  exerciseName,
  weightKg,
  durationMinutes,
}) => {
  const met = getMetValue(exerciseName);
  if (!met) {
    console.warn(`[Calories] Unknown exercise: "${exerciseName}"`);
    return 0;
  }
  return calculateCalories({ met, weightKg, durationMinutes });
};

// single entry point — call this after session stops
const calculateCaloriesFromSession = ({ exerciseName, reps, weightKg }) => {
  const durationMinutes = calculateDurationMinutesFromReps({
    exerciseName,
    reps,
  });

  return calculateCaloriesByExercise({
    exerciseName,
    weightKg,
    durationMinutes,
  });
};

module.exports = {
  MET_VALUES,
  SECONDS_PER_REP,
  getMetValue,
  getSecondsPerRep,
  calculateDurationMinutesFromReps,
  calculateCalories,
  calculateCaloriesByExercise,
  calculateCaloriesFromSession,
};
