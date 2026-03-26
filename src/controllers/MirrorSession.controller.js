const mirrorSessionService = require("../services/MirrorSession.service");
const {
  saveExerciseStart,
  saveExerciseResult,
  startMirrorExerciseSession,
  stopMirrorExerciseSession,
  getMirrorExerciseSessionStatus,
} = require("../services/MirrorSession.service");
const { asyncHandler } = require("../utils/asyncHandler");

function startStatsPolling(sessionId, io) {
  const interval = setInterval(async () => {
    try {
      // 1. call GET http://127.0.0.1:8000/session/status
      const { data } = await getMirrorExerciseSessionStatus();

      // 2. emit "stats_update" to phone-{sessionId} with full data
      io.to(`phone-${sessionId}`).emit("stats_update", {
        reps: data.reps,
        reps_correct: data.reps_correct,
        reps_incorrect: data.reps_incorrect,
        current_set: data.current_set,
        completed_sets: data.completed_sets,
        phase: data.phase,
        correction: data.correction,
        calories: data.calories,
        duration_sec: data.duration_seconds,
        status: data.status,
        rest_remaining: data.rest_remaining ?? 0,
        is_resting: data.status === "resting",
      });

      // 3. if session is done -> stop polling + emit completed
      if (data.status === "completed" || data.status === "stopped") {
        clearInterval(interval);
        io.to(`phone-${sessionId}`).emit("exercise_completed", {
          reps_done: data.reps,
          reps_correct: data.reps_correct,
          reps_incorrect: data.reps_incorrect,
          sets_done: data.completed_sets,
          calories: data.calories,
          duration_sec: data.duration_seconds,
          status: data.status,
        });
        io.to(`mirror-${sessionId}`).emit("exercise_completed", {
          status: data.status,
        });
      }
    } catch (err) {
      // 4. FastAPI unreachable -> stop polling + notify phone
      clearInterval(interval);
      io.to(`phone-${sessionId}`).emit("mirror_status", {
        status: "offline",
        message: "Mirror is unreachable",
      });
    }
  }, 300);

  return interval;
}

// Generate Session
exports.generateSession = asyncHandler(async (req, res) => {
  const session = await mirrorSessionService.generateMirrorSession();

  res.status(201).json({
    success: true,
    sessionId: session.sessionId,
    expiresAt: session.expiresAt,
  });
});

// Connect Mirror to User
exports.connectMirror = asyncHandler(async (req, res) => {
  const { sessionId } = req.body;

  const session = await mirrorSessionService.connectMirrorToUser(
    sessionId,
    req.userId,
  );

  // Emit real-time event to mirror device
  const io = req.app.get("io");
  if (io) {
    // Populate user data for mirror device
    await session.populate("user", "-password");

    io.to(`mirror-${sessionId}`).emit("mirror-user-connected", {
      success: true,
      user: session.user,
      sessionId: session.sessionId,
      connectedAt: new Date(),
    });

    console.log(`Emitted user connection to mirror session: ${sessionId}`);
  }

  res.json({
    success: true,
    message: "Mirror connected successfully",
    session: {
      sessionId: session.sessionId,
      status: session.status,
      connectedAt: session.updatedAt,
    },
  });
});

// Mirror fetch session data
exports.getSessionData = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;

  const session = await mirrorSessionService.fetchSessionData(sessionId);

  res.json({
    success: true,
    user: session.user,
    sessionId: session.sessionId,
    status: session.status,
    connectedAt: session.updatedAt,
  });
});

// Disconnect mirror session
exports.disconnectMirror = asyncHandler(async (req, res) => {
  const { sessionId } = req.body;
  try {
    await stopMirrorExerciseSession();
  } catch (_) {
    // silent — model may already be stopped
  }

  const session = await mirrorSessionService.disconnectMirrorSession(sessionId);

  // Emit real-time event to notify disconnection
  const io = req.app.get("io");
  if (io) {
    io.to(`mirror-${sessionId}`).emit("mirror-session-ended", {
      sessionId,
      message: "Session has been disconnected",
    });
  }

  res.json({
    success: true,
    message: "Mirror session disconnected",
    session,
  });
});

exports.startExercise = asyncHandler(async (req, res) => {
  const { sessionId, exercise, target_reps, target_sets, rest_seconds } =
    req.body;
  const userId = req.userId || req.body.user_id;

  // Exercise can start only when mirror session is connected.
  await mirrorSessionService.fetchSessionData(sessionId);

  if (!userId) {
    return res.status(400).json({
      success: false,
      error: "Missing user_id. Authenticate user or include user_id in body.",
    });
  }

  // 1. call FastAPI on the mirror
  let mirrorResponse;
  try {
    mirrorResponse = await startMirrorExerciseSession({
      exercise,
      target_reps,
      target_sets,
      rest_seconds,
      user_id: userId,
    });
  } catch (err) {
    return res.status(502).json({
      success: false,
      error: "Mirror is unreachable. Make sure FastAPI is running.",
      detail: err.response?.data?.detail || err.message,
    });
  }

  await saveExerciseStart(sessionId, {
    exercise,
    target_reps,
    target_sets,
    rest_seconds,
  });

  // 2. notify mirror screen via socket
  const io = req.app.get("io");
  if (io) {
    io.to(`mirror-${sessionId}`).emit("exercise-started", {
      exercise,
      target_reps,
      target_sets,
      rest_seconds,
      startedAt: new Date(),
    });

    // 3. notify phone too so UI updates
    io.to(`phone-${sessionId}`).emit("exercise-started", {
      exercise,
      target_reps,
      target_sets,
    });

    startStatsPolling(sessionId, io);
  }

  res.status(200).json({
    success: true,
    message: `Exercise ${exercise} started on mirror`,
    mirrorSession: mirrorResponse.data,
  });
});

exports.getExerciseStatus = asyncHandler(async (req, res) => {
  try {
    const { data } = await getMirrorExerciseSessionStatus();

    return res.json({
      success: true,
      status: data.status,
      data,
    });
  } catch (err) {
    return res.status(502).json({
      success: false,
      error: "Mirror is unreachable. Make sure FastAPI is running.",
      detail: err.response?.data?.detail || err.message,
    });
  }
});

exports.stopExercise = asyncHandler(async (req, res) => {
  const { sessionId } = req.body;

  // 1. call FastAPI stop
  let mirrorResponse;
  try {
    mirrorResponse = await stopMirrorExerciseSession();
  } catch (err) {
    return res.status(502).json({
      success: false,
      error: "Mirror is unreachable or no session is running.",
      detail: err.response?.data?.detail || err.message,
    });
  }

  const final_stats =
    mirrorResponse.data?.summary?.final_stats ||
    mirrorResponse.data?.final_stats;

  if (!final_stats) {
    return res.status(502).json({
      success: false,
      error: "Invalid mirror stop response: final_stats is missing.",
      detail: mirrorResponse.data,
    });
  }
  const result = {
    reps_done: final_stats.reps,
    reps_correct: final_stats.reps_correct,
    reps_incorrect: final_stats.reps_incorrect,
    sets_done: final_stats.completed_sets,
    duration_sec: final_stats.duration_seconds,
    status: final_stats.status,
    stopped_at: final_stats.stopped_at,
  };

  await saveExerciseResult(sessionId, result);

  // 2. push summary to phone and mirror via socket
  const io = req.app.get("io");
  if (io) {
    io.to(`mirror-${sessionId}`).emit("exercise-completed", result);
    io.to(`phone-${sessionId}`).emit("exercise-completed", result);
  }

  res.json({
    success: true,
    message: "Exercise stopped and saved",
    result,
  });
});
