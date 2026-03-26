const MirrorSession = require("../models/MirrorSession.model");
const crypto = require("crypto");
const axios = require("axios");

const MIRROR_API = process.env.MIRROR_API_URL || "http://127.0.0.1:8000";

// Generate a new mirror session
exports.generateMirrorSession = async () => {
  const sessionId = crypto.randomBytes(6).toString("hex");
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  const session = await MirrorSession.create({
    sessionId,
    expiresAt,
  });

  return session;
};

// Connect mirror to authenticated user
exports.connectMirrorToUser = async (sessionId, userId) => {
  if (!sessionId) {
    const error = new Error("Session ID is required");
    error.status = 400;
    throw error;
  }

  const session = await MirrorSession.findOne({ sessionId });

  if (!session) {
    const error = new Error("Session not found");
    error.status = 404;
    throw error;
  }

  if (session.status !== "pending") {
    const error = new Error("Session already used");
    error.status = 400;
    throw error;
  }

  if (session.expiresAt < new Date()) {
    session.status = "expired";
    await session.save();
    const error = new Error("Session expired");
    error.status = 400;
    throw error;
  }

  session.user = userId;
  session.status = "connected";
  await session.save();

  return session;
};

// Get session data with user information
exports.fetchSessionData = async (sessionId) => {
  if (!sessionId) {
    const error = new Error("Session ID is required");
    error.status = 400;
    throw error;
  }

  const session = await MirrorSession.findOne({ sessionId }).populate(
    "user",
    "-password",
  );

  if (!session) {
    const error = new Error("Session not found");
    error.status = 404;
    throw error;
  }

  if (session.status !== "connected") {
    const error = new Error("Mirror not connected yet");
    error.status = 400;
    throw error;
  }

  return session;
};

// Disconnect mirror session
exports.disconnectMirrorSession = async (sessionId) => {
  if (!sessionId) {
    const error = new Error("Session ID is required");
    error.status = 400;
    throw error;
  }

  const session = await MirrorSession.findOne({ sessionId });

  if (!session) {
    const error = new Error("Session not found");
    error.status = 404;
    throw error;
  }

  session.status = "expired";
  await session.save();

  return session;
};

// Save exercise start data for a mirror session.
exports.saveExerciseStart = async (sessionId, exerciseData) => {
  const session = await MirrorSession.findOneAndUpdate(
    { sessionId },
    {
      $set: {
        exerciseStatus: "exercising",
      },
      $push: {
        exercises: {
          name: exerciseData.exercise,
          target_reps: exerciseData.target_reps,
          target_sets: exerciseData.target_sets,
          rest_seconds: exerciseData.rest_seconds,
          startedAt: new Date(),
          reps_done: 0,
          reps_correct: 0,
          reps_incorrect: 0,
          sets_done: 0,
          duration_sec: 0,
        },
      },
    },
    { returnDocument: "after" },
  );

  if (!session) {
    const error = new Error("Session not found");
    error.status = 404;
    throw error;
  }

  return session;
};

// Save final exercise result data for a mirror session.
exports.saveExerciseResult = async (sessionId, result) => {
  const existingSession = await MirrorSession.findOne({ sessionId });

  if (!existingSession) {
    const error = new Error("Session not found");
    error.status = 404;
    throw error;
  }

  const lastExerciseIndex = (existingSession.exercises || []).length - 1;
  const exerciseCalories = Number(
    result.calories_burned ?? result.exercise_calories ?? 0,
  );
  const safeExerciseCalories =
    !Number.isNaN(exerciseCalories) && exerciseCalories >= 0
      ? exerciseCalories
      : 0;
  const nextTotalCalories = Number(
    (
      Number(existingSession.total_calories || 0) + safeExerciseCalories
    ).toFixed(2),
  );

  if (lastExerciseIndex < 0) {
    const session = await MirrorSession.findOneAndUpdate(
      { sessionId },
      {
        $set: {
          exerciseStatus: result.status,
          total_calories: nextTotalCalories,
        },
        $push: {
          exercises: {
            completedAt: result.stopped_at,
            reps_done: result.reps_done,
            reps_correct: result.reps_correct,
            reps_incorrect: result.reps_incorrect,
            sets_done: result.sets_done,
            duration_sec: result.duration_sec,
            calories_burned: safeExerciseCalories,
          },
        },
      },
      { returnDocument: "after" },
    );

    return session;
  }

  const session = await MirrorSession.findOneAndUpdate(
    { sessionId },
    {
      $set: {
        exerciseStatus: result.status,
        total_calories: nextTotalCalories,
        [`exercises.${lastExerciseIndex}.reps_done`]: result.reps_done,
        [`exercises.${lastExerciseIndex}.reps_correct`]: result.reps_correct,
        [`exercises.${lastExerciseIndex}.reps_incorrect`]:
          result.reps_incorrect,
        [`exercises.${lastExerciseIndex}.sets_done`]: result.sets_done,
        [`exercises.${lastExerciseIndex}.duration_sec`]: result.duration_sec,
        [`exercises.${lastExerciseIndex}.completedAt`]: result.stopped_at,
        [`exercises.${lastExerciseIndex}.calories_burned`]:
          safeExerciseCalories,
      },
    },
    { returnDocument: "after" },
  );

  return session;
};

exports.startMirrorExerciseSession = async ({
  exercise,
  target_reps,
  target_sets,
  rest_seconds,
  user_id,
}) => {
  return axios.post(`${MIRROR_API}/session/start`, {
    exercise,
    target_reps,
    target_sets,
    rest_seconds: rest_seconds || 30,
    user_id,
  });
};

exports.stopMirrorExerciseSession = async () => {
  return axios.post(`${MIRROR_API}/session/stop`);
};

exports.getMirrorExerciseSessionStatus = async () => {
  return axios.get(`${MIRROR_API}/session/status`);
};
