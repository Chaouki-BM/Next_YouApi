const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    fullname: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    isVerified: { type: Boolean, default: false },
    verificationCode: { type: String, required: false },
    resetPasswordCode: { type: String, required: false },
    resetPasswordExpires: { type: Date, required: false },
    profile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "profile",
      required: false,
    },
    BodyAnalysis: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BodyAnalysis",
      required: false,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("user", userSchema);
