const userService = require("../services/User.service");
const { asyncHandler } = require("../utils/asyncHandler");

// Register controller
const register = asyncHandler(async (req, res, next) => {
  const result = await userService.register(req.body);
  res.status(201).json({
    success: true,
    data: result,
  });
});

// Login controller
const login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;
  console.log("Login attempt for email:", email, "with password:", password);
  const result = await userService.login(email, password);
  res.status(200).json({
    success: true,
    data: result,
  });
});

// Verify email controller
const verifyEmail = asyncHandler(async (req, res, next) => {
  const { email, code } = req.body;
  const result = await userService.verifyEmailCode(email, code);
  res.status(200).json({
    success: true,
    data: result,
  });
});

// Request password reset controller
const requestPasswordReset = asyncHandler(async (req, res, next) => {
  const { email } = req.body;
  const result = await userService.requestPasswordReset(email);
  res.status(200).json({
    success: true,
    data: result,
  });
});

// Reset password controller
const resetPassword = asyncHandler(async (req, res, next) => {
  const { email, code, newPassword } = req.body;
  const result = await userService.resetPassword(email, code, newPassword);
  res.status(200).json({
    success: true,
    data: result,
  });
});

// Update personal information controller
const updatePersonalInfo = asyncHandler(async (req, res, next) => {
  const updates = req.body;
  const result = await userService.updatePersonalInfo(req.userId, updates);
  res.status(200).json({
    success: true,
    data: result,
  });
});

const User = require("../models/User.model");
const Profile = require("../models/Profile.model");

// Get user and profile data by token (login-like response)
const getUserProfile = asyncHandler(async (req, res, next) => {
  const userId = req.userId;
  const result = await userService.getUserProfileById(userId);

  res.status(200).json({
    success: true,
    data: result,
  });
});

// Handles authenticated password change requests.
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (!currentPassword || !newPassword || !confirmPassword) {
    const err = new Error("All fields are required");
    err.status = 400;
    throw err;
  }

  const result = await userService.changePassword(req.userId, {
    currentPassword,
    newPassword,
    confirmPassword,
  });
  return res.status(200).json(result);
});

// Handles authenticated account deletion requests.
const deleteAccount = asyncHandler(async (req, res) => {
  const { password } = req.body;

  if (!password) {
    const err = new Error("Password is required to delete account");
    err.status = 400;
    throw err;
  }

  const result = await userService.deleteAccount(req.userId, { password });
  return res.status(200).json(result);
});

const downloadFitnessReport = asyncHandler(async (req, res) => {
  const { buffer, fileName } = await userService.getFitnessReportPdf(
    req.userId,
  );

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=\"${fileName}\"`);
  return res.status(200).send(buffer);
});

module.exports = {
  register,
  login,
  verifyEmail,
  requestPasswordReset,
  resetPassword,
  updatePersonalInfo,
  getUserProfile,
  changePassword,
  deleteAccount,
  downloadFitnessReport,
};
