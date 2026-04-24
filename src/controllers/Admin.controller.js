const adminService = require("../services/Admin.service");
const { asyncHandler } = require("../utils/asyncHandler");

const getDashboardStats = asyncHandler(async (req, res) => {
  const result = await adminService.getDashboardStats();
  res.status(200).json({ success: true, data: result });
});

const getRegistrationChart = asyncHandler(async (req, res) => {
  const result = await adminService.getRegistrationChart();
  res.status(200).json({ success: true, data: result });
});

const getUsersByCountry = asyncHandler(async (req, res) => {
  const result = await adminService.getUsersByCountry();
  res.status(200).json({ success: true, data: result });
});

const getTopExercises = asyncHandler(async (req, res) => {
  const result = await adminService.getTopExercises();
  res.status(200).json({ success: true, data: result });
});

const getAllUsers = asyncHandler(async (req, res) => {
  const { page, limit, search, country, status } = req.query;
  const result = await adminService.getAllUsers(
    page,
    limit,
    search,
    country,
    status,
  );
  res.status(200).json({ success: true, data: result });
});

const deleteUser = asyncHandler(async (req, res) => {
  const result = await adminService.deleteUser(req.params.id);
  res.status(200).json({ success: true, data: result });
});

const loginAdmin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const result = await adminService.loginAdmin(email, password);
  res.status(200).json({ success: true, data: result });
});

const createAdmin = asyncHandler(async (req, res) => {
  const result = await adminService.createAdmin(req.body);
  res.status(200).json({ success: true, data: result });
});

const getUserReport = asyncHandler(async (req, res) => {
  const result = await adminService.getUserReport(req.params.id);
  res.status(200).json({ success: true, data: result });
});

const createExercise = asyncHandler(async (req, res) => {
  const result = await adminService.createExercise(req.body);
  res.status(200).json({ success: true, data: result });
});

const updateExercise = asyncHandler(async (req, res) => {
  const result = await adminService.updateExercise(req.params.id, req.body);
  res.status(200).json({ success: true, data: result });
});

const deleteExercise = asyncHandler(async (req, res) => {
  const result = await adminService.deleteExercise(req.params.id);
  res.status(200).json({ success: true, data: result });
});

const getAllReports = asyncHandler(async (req, res) => {
  const { page, limit, startDate, endDate } = req.query;
  const result = await adminService.getAllReports(
    page,
    limit,
    startDate,
    endDate,
  );
  res.status(200).json({ success: true, data: result });
});

module.exports = {
  getDashboardStats,
  getRegistrationChart,
  getUsersByCountry,
  getTopExercises,
  getAllUsers,
  deleteUser,
  loginAdmin,
  createAdmin,
  getUserReport,
  createExercise,
  updateExercise,
  deleteExercise,
  getAllReports,
};
