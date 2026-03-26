const exerciseService = require("../services/Exercise.service");
const { asyncHandler } = require("../utils/asyncHandler");

const createExercise = asyncHandler(async (req, res) => {
  const result = await exerciseService.createExercise(req.body);

  res.status(201).json({
    success: true,
    data: result,
  });
});

const getExerciseById = asyncHandler(async (req, res) => {
  const result = await exerciseService.getExerciseById(req.params.id);

  res.status(200).json({
    success: true,
    data: result,
  });
});

const getAllExercises = asyncHandler(async (req, res) => {
  const result = await exerciseService.getAllExercises();

  res.status(200).json({
    success: true,
    data: result,
  });
});

const updateExercise = asyncHandler(async (req, res) => {
  const result = await exerciseService.updateExercise(req.params.id, req.body);

  res.status(200).json({
    success: true,
    data: result,
  });
});

const deleteExercise = asyncHandler(async (req, res) => {
  const result = await exerciseService.deleteExercise(req.params.id);

  res.status(200).json({
    success: true,
    data: result,
  });
});

module.exports = {
  createExercise,
  getExerciseById,
  getAllExercises,
  updateExercise,
  deleteExercise,
};
