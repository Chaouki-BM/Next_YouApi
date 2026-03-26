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

module.exports = {
  register,
  login,
  verifyEmail,
  requestPasswordReset,
  resetPassword,
  updatePersonalInfo,
};
