const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const User = require("../models/User.model");
const Profile = require("../models/Profile.model");

// Nodemailer configuration
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// Generate random verification code
const generateVerificationCode = () => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

const generateResetCode = () => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

const normalizeStringArray = (value) => {
  if (Array.isArray(value)) {
    return value
      .filter((item) => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    const trimmedValue = value.trim();
    return trimmedValue ? [trimmedValue] : [];
  }

  return [];
};

class UserService {
  // Register new user
  async register(userData) {
    const {
      fullname,
      email,
      password,
      height,
      weight,
      age_years,
      sex,
      activity_level_lifestyle,
      medical_condition,
      allergies,
      country,
      target_weight,
      experience_level,
      focus_goal,
      workout_days,
      preferred_training_time,
      session_duration,
      injury_notes,
    } = userData;

    // Validate required fields for user
    if (!fullname || !email || !password) {
      const err = new Error("fullname, email, and password are required");
      err.status = 400;
      throw err;
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      const err = new Error("User already exists with this email");
      err.status = 409;
      throw err;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate verification code
    const verificationCode = generateVerificationCode();

    // Create new user (without profile data)
    const newUser = new User({
      fullname,
      email,
      password: hashedPassword,
      isVerified: false,
      verificationCode,
    });

    const savedUser = await newUser.save();

    // Create profile if profile data is provided
    let profileData = null;
    if (height && weight && age_years && sex && activity_level_lifestyle) {
      profileData = new Profile({
        userId: savedUser._id,
        height,
        weight,
        age_years,
        sex,
        activity_level_lifestyle,
        medical_condition: normalizeStringArray(medical_condition),
        allergies: Array.isArray(allergies) ? allergies : [],
        country: country || "",
        target_weight,
        experience_level: experience_level || "",
        focus_goal: focus_goal || "",
        workout_days: Array.isArray(workout_days) ? workout_days : [],
        preferred_training_time: preferred_training_time || "",
        session_duration,
        injury_notes: injury_notes || "",
      });

      const savedProfile = await profileData.save();
      savedUser.profile = savedProfile._id;
      await savedUser.save();
    }

    // Send verification email
    await this.sendVerificationEmail(
      savedUser.email,
      savedUser.fullname,
      savedUser.verificationCode,
    );

    return {
      id: savedUser._id,
      fullname: savedUser.fullname,
      email: savedUser.email,
      message:
        "User registered successfully. Check your email for verification code.",
    };
  }

  // Login user
  async login(email, password) {
    // Validate inputs
    if (!email || !password) {
      const err = new Error("Email and password are required");
      err.status = 400;
      throw err;
    }

    // Find user by email
    const user = await User.findOne({ email }).populate("profile");
    if (!user) {
      const err = new Error("Invalid email or password");
      err.status = 401;
      throw err;
    }

    // Check if email is verified
    if (!user.isVerified) {
      const verificationCode = generateVerificationCode();
      user.verificationCode = verificationCode;
      await user.save();
      await this.sendVerificationEmail(
        user.email,
        user.fullname,
        verificationCode,
      );
      const err = new Error(
        "Email not verified. A new verification code has been sent to your email. Please check your inbox and verify your account.",
      );
      err.status = 403;
      throw err;
    }

    // Compare passwords
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      const err = new Error("Invalid email or password");
      err.status = 401;
      throw err;
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET || "your_jwt_secret_key",
      { expiresIn: "7d" },
    );

    const userData = {
      id: user._id,
      fullname: user.fullname,
      email: user.email,
    };

    // Include profile data if it exists
    if (user.profile) {
      userData.profile = {
        height: user.profile.height,
        weight: user.profile.weight,
        age_years: user.profile.age_years,
        sex: user.profile.sex,
        activity_level_lifestyle: user.profile.activity_level_lifestyle,
        medical_condition: user.profile.medical_condition,
        allergies: user.profile.allergies,
        country: user.profile.country,
        target_weight: user.profile.target_weight,
        experience_level: user.profile.experience_level,
        focus_goal: user.profile.focus_goal,
        workout_days: user.profile.workout_days,
        preferred_training_time: user.profile.preferred_training_time,
        session_duration: user.profile.session_duration,
        injury_notes: user.profile.injury_notes,
      };
    }

    return {
      token,
      userId: user._id,
      user: userData,
      message: "Login successful",
    };
  }

  // Send verification email
  async sendVerificationEmail(email, fullname, verificationCode) {
    try {
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: "Email Verification Code",
        html: `
          <h2>Welcome to NextYou, ${fullname}!</h2>
          <p>Your email verification code is:</p>
          <h1 style="color: #007bff; font-size: 32px; letter-spacing: 2px;">${verificationCode}</h1>
          <p>This code will expire in 10 minutes.</p>
          <p>If you didn't sign up for NextYou, please ignore this email.</p>
        `,
      };

      await transporter.sendMail(mailOptions);
      return { message: "Verification email sent successfully" };
    } catch (error) {
      const err = new Error("Failed to send verification email");
      err.status = 500;
      throw err;
    }
  }

  async sendPasswordResetEmail(email, fullname, resetCode) {
    try {
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: "Password Reset Code",
        html: `
          <h2>Hello ${fullname},</h2>
          <p>Use the code below to reset your password:</p>
          <h1 style="color: #007bff; font-size: 32px; letter-spacing: 2px;">${resetCode}</h1>
          <p>This code will expire in 10 minutes.</p>
          <p>If you did not request this, you can ignore this email.</p>
        `,
      };

      await transporter.sendMail(mailOptions);
      return { message: "Password reset email sent successfully" };
    } catch (error) {
      const err = new Error("Failed to send password reset email");
      err.status = 500;
      throw err;
    }
  }

  // Verify email with code
  async verifyEmailCode(email, code) {
    if (!email || !code) {
      const err = new Error("Email and verification code are required");
      err.status = 400;
      throw err;
    }

    const user = await User.findOne({ email });
    if (!user) {
      const err = new Error("User not found");
      err.status = 404;
      throw err;
    }

    if (user.isVerified) {
      const err = new Error("User is already verified");
      err.status = 400;
      throw err;
    }

    if (user.verificationCode !== code) {
      const err = new Error("Invalid verification code");
      err.status = 401;
      throw err;
    }

    user.isVerified = true;
    user.verificationCode = null;
    await user.save();

    return {
      message: "Email verified successfully",
      user: {
        id: user._id,
        fullname: user.fullname,
        email: user.email,
      },
    };
  }

  async requestPasswordReset(email) {
    if (!email) {
      const err = new Error("Email is required");
      err.status = 400;
      throw err;
    }

    const user = await User.findOne({ email });
    if (!user) {
      const err = new Error("User not found");
      err.status = 404;
      throw err;
    }

    const resetCode = generateResetCode();
    user.resetPasswordCode = resetCode;
    user.resetPasswordExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    await this.sendPasswordResetEmail(user.email, user.fullname, resetCode);

    return {
      message: "Password reset code sent to email",
    };
  }

  async resetPassword(email, code, newPassword) {
    if (!email || !code || !newPassword) {
      const err = new Error("Email, code, and new password are required");
      err.status = 400;
      throw err;
    }

    const user = await User.findOne({ email });
    if (!user) {
      const err = new Error("User not found");
      err.status = 404;
      throw err;
    }

    if (!user.resetPasswordCode || user.resetPasswordCode !== code) {
      const err = new Error("Invalid reset code");
      err.status = 401;
      throw err;
    }

    if (!user.resetPasswordExpires || user.resetPasswordExpires < new Date()) {
      const err = new Error("Reset code has expired");
      err.status = 401;
      throw err;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.resetPasswordCode = null;
    user.resetPasswordExpires = null;
    await user.save();

    return {
      message: "Password reset successful",
    };
  }

  async updatePersonalInfo(userId, updates) {
    if (!userId) {
      const err = new Error("User ID is required");
      err.status = 400;
      throw err;
    }

    const allowedFields = [
      "height",
      "weight",
      "age_years",
      "sex",
      "activity_level_lifestyle",
      "medical_condition",
      "allergies",
      "country",
      "target_weight",
      "experience_level",
      "focus_goal",
      "workout_days",
      "preferred_training_time",
      "session_duration",
      "injury_notes",
    ];

    const updatePayload = {};
    allowedFields.forEach((field) => {
      if (updates[field] !== undefined) {
        updatePayload[field] = updates[field];
      }
    });

    if (updatePayload.medical_condition !== undefined) {
      updatePayload.medical_condition = normalizeStringArray(
        updatePayload.medical_condition,
      );
    }

    if (Object.keys(updatePayload).length === 0) {
      const err = new Error("No valid fields to update");
      err.status = 400;
      throw err;
    }

    const user = await User.findById(userId).populate("profile");
    if (!user) {
      const err = new Error("User not found");
      err.status = 404;
      throw err;
    }

    // Update or create profile
    let profile = user.profile;
    if (!profile) {
      profile = new Profile({
        userId: user._id,
        ...updatePayload,
      });
      await profile.save();
      user.profile = profile._id;
      await user.save();
    } else {
      Object.assign(profile, updatePayload);
      await profile.save();
    }

    return {
      message: "Personal information updated successfully",
      user: {
        id: user._id,
        fullname: user.fullname,
        email: user.email,
        profile: profile,
      },
    };
  }
}

module.exports = new UserService();
