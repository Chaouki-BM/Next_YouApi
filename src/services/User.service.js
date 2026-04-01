const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const User = require("../models/User.model");
const Profile = require("../models/Profile.model");
const BodyAnalysis = require("../models/BodyAnalysis.model");
const { calculateMetrics, getWeekNumber } = require("../utils/bodyMetrics");
const WeeklyCheckIn = require("../models/WeeklyCheckIn.model");
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
    //calculate BMI and muscle mass for initial profile if profile data is provided
    const { bmi, muscle_mass, bmi_category } = calculateMetrics({
      weightKg: weight,
      heightCm: height,
      age: age_years,
      gender: sex,
    });
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

      const is_weight_lost = weight > target_weight;

      const bodyAnalysis = new BodyAnalysis({
        userId: savedUser._id,
        current_weight: weight,
        is_weight_lost: is_weight_lost || false,
        current_bmi: bmi,
        bmi_category,
        current_muscle_mass: muscle_mass,
        goal_weight: target_weight || null,
      });
      await bodyAnalysis.save();
    }
    const now = new Date();
    const week_number = getWeekNumber(now);
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const checkIn = new WeeklyCheckIn({
      userId: savedUser._id,
      week_number: week_number,
      year: year,
      weight: weight,
      bmi: bmi,
      muscle_mass: muscle_mass,
      date: now,
      month: month,
      source: "manual",
    });
    await checkIn.save();

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
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background:#0D0D0D;
             font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0"
          style="background:#161620;border-radius:20px;
                 border:1px solid rgba(255,122,60,0.3);
                 overflow:hidden;max-width:520px;width:100%;">

          <!-- HEADER -->
          <tr>
            <td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);
                        padding:36px 32px 28px;text-align:center;
                        border-bottom:1px solid rgba(255,122,60,0.15);">
              <img
                src="https://res.cloudinary.com/dpx0kjlbd/image/upload/v1775033816/LogoNextYou_qvdzyx.png"
                alt="NextYou"
                width="120"
                style="display:block;margin:0 auto;max-width:120px;"
              />
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 6px;font-size:16px;color:#A2A8B8;">
                Welcome to NextYou, ${fullname}!
              </p>
              <h2 style="margin:0 0 16px;font-size:22px;font-weight:700;
                          color:#F5F7FB;line-height:1.3;">
                Verify your email address ✉️
              </h2>
              <p style="margin:0 0 24px;font-size:14px;color:#A2A8B8;line-height:1.7;">
                Your email verification code is:
              </p>

              <!-- CODE BOX -->
              <table width="100%" cellpadding="0" cellspacing="0"
                style="background:rgba(255,90,60,0.08);
                        border:1px solid rgba(255,90,60,0.35);
                        border-radius:14px;margin-bottom:24px;">
                <tr>
                  <td style="padding:24px;text-align:center;">
                    <p style="margin:0 0 10px;font-size:11px;color:#A2A8B8;
                                letter-spacing:0.1em;text-transform:uppercase;">
                      Your verification code
                    </p>
                    <p style="margin:0 0 12px;font-size:44px;font-weight:800;
                                color:#FF7A3C;letter-spacing:12px;
                                font-family:'Courier New',monospace;">
                      ${verificationCode}
                    </p>
                    <p style="margin:0;font-size:12px;color:#A2A8B8;">
                      ● &nbsp; Expires in
                      <strong style="color:#FF7A3C;">10 minutes</strong>
                    </p>
                  </td>
                </tr>
              </table>

              <!-- DIVIDER -->
              <hr style="border:none;
                          border-top:1px solid rgba(255,255,255,0.07);
                          margin:24px 0;"/>

              <!-- INFO ROW -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="40" valign="top">
                    <div style="width:32px;height:32px;border-radius:8px;
                                background:rgba(255,122,60,0.1);
                                border:1px solid rgba(255,122,60,0.2);
                                text-align:center;line-height:32px;
                                font-size:14px;">
                      🙋
                    </div>
                  </td>
                  <td style="padding-left:12px;vertical-align:top;">
                    <p style="margin:0 0 2px;font-size:13px;
                                font-weight:600;color:#F5F7FB;">
                      Didn't sign up for NextYou?
                    </p>
                    <p style="margin:0;font-size:12px;color:#A2A8B8;line-height:1.6;">
                      Please ignore this email. No account will be
                      created without verification.
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:rgba(0,0,0,0.25);padding:20px 32px;
                        text-align:center;
                        border-top:1px solid rgba(255,255,255,0.06);">
              <p style="margin:0 0 6px;font-size:12px;
                          font-weight:600;color:#FF7A3C;">
                NextYou — Your AI Fitness Coach
              </p>
              <p style="margin:0;font-size:11px;color:#555;line-height:1.8;">
                This email was sent to ${email}<br/>
                © 2026 NextYou. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>
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
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background:#0D0D0D;
             font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0"
          style="background:#161620;border-radius:20px;
                 border:1px solid rgba(255,122,60,0.3);
                 overflow:hidden;max-width:520px;width:100%;">

          <!-- HEADER -->
          <tr>
            <td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);
                        padding:36px 32px 28px;text-align:center;
                        border-bottom:1px solid rgba(255,122,60,0.15);">
              <img
                src="https://res.cloudinary.com/dpx0kjlbd/image/upload/v1775033816/LogoNextYou_qvdzyx.png"
                alt="NextYou"
                width="120"
                style="display:block;margin:0 auto;max-width:120px;"
              />
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 6px;font-size:16px;color:#A2A8B8;">
                Hello ${fullname},
              </p>
              <h2 style="margin:0 0 16px;font-size:22px;font-weight:700;
                          color:#F5F7FB;line-height:1.3;">
                Reset your password 🔐
              </h2>
              <p style="margin:0 0 24px;font-size:14px;color:#A2A8B8;line-height:1.7;">
                Use the code below to reset your password:
              </p>

              <!-- CODE BOX -->
              <table width="100%" cellpadding="0" cellspacing="0"
                style="background:rgba(255,90,60,0.08);
                        border:1px solid rgba(255,90,60,0.35);
                        border-radius:14px;margin-bottom:24px;">
                <tr>
                  <td style="padding:24px;text-align:center;">
                    <p style="margin:0 0 10px;font-size:11px;color:#A2A8B8;
                                letter-spacing:0.1em;text-transform:uppercase;">
                      Your reset code
                    </p>
                    <p style="margin:0 0 12px;font-size:44px;font-weight:800;
                                color:#FF7A3C;letter-spacing:12px;
                                font-family:'Courier New',monospace;">
                      ${resetCode}
                    </p>
                    <p style="margin:0;font-size:12px;color:#A2A8B8;">
                      ● &nbsp; Expires in
                      <strong style="color:#FF7A3C;">10 minutes</strong>
                    </p>
                  </td>
                </tr>
              </table>

              <!-- DIVIDER -->
              <hr style="border:none;
                          border-top:1px solid rgba(255,255,255,0.07);
                          margin:24px 0;"/>

              <!-- INFO ROW 1 -->
              <table width="100%" cellpadding="0" cellspacing="0"
                style="margin-bottom:16px;">
                <tr>
                  <td width="40" valign="top">
                    <div style="width:32px;height:32px;border-radius:8px;
                                background:rgba(255,122,60,0.1);
                                border:1px solid rgba(255,122,60,0.2);
                                text-align:center;line-height:32px;
                                font-size:14px;">
                      ⚠️
                    </div>
                  </td>
                  <td style="padding-left:12px;vertical-align:top;">
                    <p style="margin:0 0 2px;font-size:13px;
                                font-weight:600;color:#F5F7FB;">
                      Never share this code
                    </p>
                    <p style="margin:0;font-size:12px;color:#A2A8B8;line-height:1.6;">
                      NextYou will never ask for your reset code
                      by phone or email.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- INFO ROW 2 -->
              <table width="100%" cellpadding="0" cellspacing="0"
                style="margin-bottom:16px;">
                <tr>
                  <td width="40" valign="top">
                    <div style="width:32px;height:32px;border-radius:8px;
                                background:rgba(255,122,60,0.1);
                                border:1px solid rgba(255,122,60,0.2);
                                text-align:center;line-height:32px;
                                font-size:14px;">
                      🔒
                    </div>
                  </td>
                  <td style="padding-left:12px;vertical-align:top;">
                    <p style="margin:0 0 2px;font-size:13px;
                                font-weight:600;color:#F5F7FB;">
                      Didn't request this?
                    </p>
                    <p style="margin:0;font-size:12px;color:#A2A8B8;line-height:1.6;">
                      You can safely ignore this email.
                      Your account remains secure.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- INFO ROW 3 -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="40" valign="top">
                    <div style="width:32px;height:32px;border-radius:8px;
                                background:rgba(255,122,60,0.1);
                                border:1px solid rgba(255,122,60,0.2);
                                text-align:center;line-height:32px;
                                font-size:14px;">
                      ⏱️
                    </div>
                  </td>
                  <td style="padding-left:12px;vertical-align:top;">
                    <p style="margin:0 0 2px;font-size:13px;
                                font-weight:600;color:#F5F7FB;">
                      Code expired?
                    </p>
                    <p style="margin:0;font-size:12px;color:#A2A8B8;line-height:1.6;">
                      Request a new code from the app and
                      we'll send a fresh one instantly.
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:rgba(0,0,0,0.25);padding:20px 32px;
                        text-align:center;
                        border-top:1px solid rgba(255,255,255,0.06);">
              <p style="margin:0 0 6px;font-size:12px;
                          font-weight:600;color:#FF7A3C;">
                NextYou — Your AI Fitness Coach
              </p>
              <p style="margin:0;font-size:11px;color:#555;line-height:1.8;">
                This email was sent to ${email}<br/>
                © 2026 NextYou. All rights reserved.<br/>
                You received this because a password reset was requested.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>
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

    // After updating profile, recalculate BMI and update BodyAnalysis
    if (profile.height && profile.age_years && profile.sex) {
      let currentWeight = profile.weight;
      const existingBodyAnalysis = await BodyAnalysis.findOne({
        userId: user._id,
      });
      if (existingBodyAnalysis && existingBodyAnalysis.current_weight) {
        currentWeight = existingBodyAnalysis.current_weight;
      }
      const { bmi, muscle_mass, bmi_category } = calculateMetrics({
        weightKg: currentWeight,
        heightCm: profile.height,
        age: profile.age_years,
        gender: profile.sex,
      });
      const is_weight_lost = profile.weight > profile.target_weight;

      await BodyAnalysis.findOneAndUpdate(
        { userId: user._id },
        {
          $set: {
            current_weight: currentWeight,
            current_bmi: bmi,
            bmi_category,
            current_muscle_mass: muscle_mass,
            goal_weight: profile.target_weight ?? null,
            is_weight_lost: is_weight_lost || false,
          },
        },
        { upsert: true, returnDocument: "after" },
      );
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
  async getUserProfileById(userId) {
    const user = await User.findById(userId)
      .select("-password")
      .populate("profile");
    if (!user) {
      const err = new Error("User not found");
      err.status = 404;
      throw err;
    }

    const userData = {
      id: user._id,
      fullname: user.fullname,
      email: user.email,
    };
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
      userId: user._id,
      user: userData,
      message: "User profile fetched successfully",
    };
  }
}

module.exports = new UserService();
