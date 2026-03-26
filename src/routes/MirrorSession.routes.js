const express = require("express");
const {
  generateSession,
  connectMirror,
  getSessionData,
  disconnectMirror,
  startExercise,
  stopExercise,
  getExerciseStatus,
} = require("../controllers/MirrorSession.controller");
const verifyToken = require("../middlewares/auth.middleware");

const router = express.Router();

// Generate new mirror session
router.post("/generate", generateSession);

// Connect mirror to authenticated user
router.post("/connect", verifyToken, connectMirror);

// Disconnect mirror session
router.post("/disconnect", disconnectMirror);
router.post("/session/start-exercise", startExercise);
router.get("/session/status", getExerciseStatus);
router.post("/session/stop-exercise", stopExercise);
// Fetch session with user data
router.get("/session/:sessionId", getSessionData);
module.exports = router;
