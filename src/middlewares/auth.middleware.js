const jwt = require("jsonwebtoken");
const { asyncHandler } = require("../utils/asyncHandler");

const verifyToken = asyncHandler(async (req, res, next) => {
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

  req.userId = decoded.userId;
  next();
});

module.exports = verifyToken;
