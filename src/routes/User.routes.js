const express = require("express");
const {
  register,
  login,
  verifyEmail,
  requestPasswordReset,
  resetPassword,
  updatePersonalInfo,
  getUserProfile,
} = require("../controllers/User.controller");
const verifyToken = require("../middlewares/auth.middleware");

const router = express.Router();

// User Routes
router.post("/register", register);

router.post("/login", login);

router.post("/verify-email", verifyEmail);

router.post("/forgot-password", requestPasswordReset);

router.post("/reset-password", resetPassword);

router.put("/update-personal-info", verifyToken, updatePersonalInfo);
router.get("/me", verifyToken, getUserProfile);
module.exports = router;
