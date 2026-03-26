const express = require("express");
const {
  createExercise,
  getExerciseById,
  getAllExercises,
  updateExercise,
  deleteExercise,
} = require("../controllers/Exercise.controller");
const cache = require("../middlewares/redisCaching.middleware");

const router = express.Router();

router.post("/", createExercise);
router.get("/", cache("exercises:all", 60), getAllExercises);
router.get(
  "/:id",
  cache((req) => `exercises:${req.params.id}`, 60),
  getExerciseById,
);
router.put("/:id", updateExercise);
router.delete("/:id", deleteExercise);

module.exports = router;
