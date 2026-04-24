const express = require("express");
const {
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
} = require("../controllers/Admin.controller");
const adminAuth = require("../middlewares/adminAuth.middleware");

const router = express.Router();

router.post("/login", loginAdmin);
//router.use(adminAuth);

router.get("/stats", getDashboardStats);
router.get("/charts/registrations", getRegistrationChart);
router.get("/charts/countries", getUsersByCountry);
router.get("/charts/top-exercises", getTopExercises);

router.get("/users", getAllUsers);
router.post("/admins", createAdmin);
router.delete("/users/:id", deleteUser);
router.get("/users/:id/report", getUserReport);

router.post("/exercises", createExercise);
router.put("/exercises/:id", updateExercise);
router.delete("/exercises/:id", deleteExercise);

router.get("/reports", getAllReports);

module.exports = router;
