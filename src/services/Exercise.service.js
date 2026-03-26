const Exercise = require("../models/Exercise.model");
const redisClient = require("../config/redis");

const invalidateExerciseCache = async (id) => {
  if (!redisClient.isReady) return;

  try {
    await redisClient.del("exercises:all");
    if (id) {
      await redisClient.del(`exercises:${id}`);
    }
  } catch (_) {
    // Ignore cache invalidation errors to keep API responses unaffected.
  }
};

class ExerciseService {
  async createExercise(exerciseData) {
    const exercise = await Exercise.create(exerciseData);
    await invalidateExerciseCache();
    return exercise;
  }

  async getExerciseById(id) {
    const exercise = await Exercise.findById(id);

    if (!exercise) {
      const err = new Error("Exercise not found");
      err.status = 404;
      throw err;
    }

    return exercise;
  }

  async getAllExercises() {
    return Exercise.find().sort({ createdAt: -1 });
  }

  async updateExercise(id, updates) {
    const exercise = await Exercise.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    if (!exercise) {
      const err = new Error("Exercise not found");
      err.status = 404;
      throw err;
    }

    await invalidateExerciseCache(id);

    return exercise;
  }

  async deleteExercise(id) {
    const exercise = await Exercise.findByIdAndDelete(id);

    if (!exercise) {
      const err = new Error("Exercise not found");
      err.status = 404;
      throw err;
    }

    await invalidateExerciseCache(id);

    return { message: "Exercise deleted successfully" };
  }
}

module.exports = new ExerciseService();
