const jwt = require("jsonwebtoken");
const User = require("../models/User.model");
const { asyncHandler } = require("../utils/asyncHandler");

const adminAuth = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    const error = new Error("Token is required");
    error.status = 403;
    throw error;
  }

  const token = authHeader.split(" ")[1];
  const decoded = jwt.verify(
    token,
    process.env.JWT_SECRET || "your_jwt_secret_key",
  );

  const user = await User.findById(decoded.userId).select("_id role").lean();
  if (!user || user.role !== "admin") {
    const error = new Error("Forbidden");
    error.status = 403;
    throw error;
  }

  req.userId = decoded.userId;
  req.user = user;
  next();
});

module.exports = adminAuth;
