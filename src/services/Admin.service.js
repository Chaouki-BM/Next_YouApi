const bcrypt = require("bcrypt");
const User = require("../models/User.model");
const Profile = require("../models/Profile.model");
const Exercise = require("../models/Exercise.model");
const NutritionPlan = require("../models/NutritionPlan.model");
const TrainingPlan = require("../models/TrainingPlan.model");
const BodyAnalysis = require("../models/BodyAnalysis.model");
const WeeklyCheckIn = require("../models/WeeklyCheckIn.model");
const MirrorSession = require("../models/MirrorSession.model");
const redisClient = require("../config/redis");

const toPagination = (page, limit) => {
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const safeLimit = Math.max(parseInt(limit, 10) || 10, 1);
  return { page: safePage, limit: safeLimit, skip: (safePage - 1) * safeLimit };
};

const invalidateExerciseCache = async (exerciseId) => {
  if (!redisClient || !redisClient.isReady) return;

  try {
    const keys = ["exercises:all"];

    for await (const key of redisClient.scanIterator({
      MATCH: "exercises:*",
      COUNT: 100,
    })) {
      keys.push(key);
    }

    if (exerciseId) {
      keys.push(`exercises:${exerciseId}`);
    }

    const uniqueKeys = [...new Set(keys)];
    if (uniqueKeys.length) {
      await redisClient.del(uniqueKeys);
    }
  } catch (_) {
    // Ignore cache invalidation errors to avoid affecting API behavior.
  }
};

class AdminService {
  async getDashboardStats() {
    const now = new Date();

    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const previousMonthStart = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1,
    );

    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const tomorrowStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
    );

    const [
      totalUsers,
      newUsersThisMonth,
      previousMonthUsers,
      totalNutritionPlans,
      totalTrainingPlans,
      activeSessionsToday,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({
        createdAt: { $gte: currentMonthStart, $lt: nextMonthStart },
      }),
      User.countDocuments({
        createdAt: { $gte: previousMonthStart, $lt: currentMonthStart },
      }),
      NutritionPlan.countDocuments(),
      TrainingPlan.countDocuments(),
      MirrorSession.countDocuments({
        createdAt: { $gte: todayStart, $lt: tomorrowStart },
      }),
    ]);

    let growthRate = 0;
    if (previousMonthUsers === 0) {
      growthRate = newUsersThisMonth > 0 ? 100 : 0;
    } else {
      growthRate =
        ((newUsersThisMonth - previousMonthUsers) / previousMonthUsers) * 100;
    }

    return {
      totalUsers,
      newUsersThisMonth,
      totalNutritionPlans,
      totalTrainingPlans,
      activeSessionsToday,
      growthRate: Number(growthRate.toFixed(2)),
    };
  }

  async getRegistrationChart() {
    const end = new Date();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 29);

    const grouped = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    const map = new Map(grouped.map((item) => [item._id, item.count]));
    const chart = [];

    for (let i = 0; i < 30; i += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const key = date.toISOString().slice(0, 10);
      chart.push({ date: key, count: map.get(key) || 0 });
    }

    return chart;
  }

  async getUsersByCountry() {
    return Profile.aggregate([
      {
        $project: {
          country: {
            $cond: [
              {
                $or: [
                  { $eq: [{ $ifNull: ["$country", ""] }, ""] },
                  { $eq: ["$country", null] },
                ],
              },
              "Unknown",
              "$country",
            ],
          },
        },
      },
      {
        $group: {
          _id: "$country",
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          country: "$_id",
          count: 1,
        },
      },
      {
        $sort: { count: -1 },
      },
    ]);
  }

  async getTopExercises() {
    return MirrorSession.aggregate([
      { $unwind: "$exercises" },
      {
        $group: {
          _id: "$exercises.name",
          count: { $sum: 1 },
        },
      },
      {
        $match: {
          _id: { $nin: [null, ""] },
        },
      },
      {
        $project: {
          _id: 0,
          name: "$_id",
          count: 1,
        },
      },
      {
        $sort: { count: -1 },
      },
      {
        $limit: 10,
      },
    ]);
  }

  async getAllUsers(page, limit, search, country, status) {
    const {
      page: safePage,
      limit: safeLimit,
      skip,
    } = toPagination(page, limit);

    const match = {};

    if (search) {
      match.$or = [
        { fullname: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    if (typeof status !== "undefined" && status !== "") {
      if (String(status).toLowerCase() === "true") {
        match.isVerified = true;
      } else if (String(status).toLowerCase() === "false") {
        match.isVerified = false;
      }
    }

    const countryMatch = country
      ? { "profile.country": { $regex: country, $options: "i" } }
      : {};

    const pipeline = [
      { $match: match },
      {
        $lookup: {
          from: "profiles",
          localField: "_id",
          foreignField: "userId",
          as: "profile",
        },
      },
      {
        $unwind: {
          path: "$profile",
          preserveNullAndEmptyArrays: true,
        },
      },
      { $match: countryMatch },
      {
        $project: {
          password: 0,
          verificationCode: 0,
          resetPasswordCode: 0,
          resetPasswordExpires: 0,
        },
      },
      { $sort: { createdAt: -1 } },
    ];

    const [users, totalResult] = await Promise.all([
      User.aggregate([...pipeline, { $skip: skip }, { $limit: safeLimit }]),
      User.aggregate([...pipeline, { $count: "total" }]),
    ]);

    const total = totalResult[0]?.total || 0;

    return {
      users,
      total,
      page: safePage,
      totalPages: Math.ceil(total / safeLimit) || 1,
    };
  }

  async deleteUser(userId) {
    const user = await User.findById(userId).select("_id").lean();
    if (!user) {
      const error = new Error("User not found");
      error.status = 404;
      throw error;
    }

    await Promise.all([
      Profile.deleteOne({ userId }),
      NutritionPlan.deleteMany({ user: userId }),
      TrainingPlan.deleteMany({ userId }),
      BodyAnalysis.deleteMany({ userId }),
      WeeklyCheckIn.deleteMany({ userId }),
      MirrorSession.deleteMany({ user: userId }),
      User.deleteOne({ _id: userId }),
    ]);

    return { message: "User deleted successfully" };
  }

  async createAdmin(adminData) {
    const { fullname, email, password } = adminData;

    if (!fullname || !email || !password) {
      const error = new Error("fullname, email, and password are required");
      error.status = 400;
      throw error;
    }

    const existingUser = await User.findOne({ email }).lean();
    if (existingUser) {
      const error = new Error("User already exists with this email");
      error.status = 409;
      throw error;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const admin = await User.create({
      fullname,
      email,
      password: hashedPassword,
      role: "admin",
      isVerified: true,
    });

    return {
      id: admin._id,
      fullname: admin.fullname,
      email: admin.email,
      role: admin.role,
      isVerified: admin.isVerified,
      message: "Admin created successfully",
    };
  }

  async loginAdmin(email, password) {
    if (!email || !password) {
      const error = new Error("Email and password are required");
      error.status = 400;
      throw error;
    }

    const user = await User.findOne({ email }).populate("profile");
    if (!user) {
      const error = new Error("Invalid email or password");
      error.status = 401;
      throw error;
    }

    if (user.role !== "admin") {
      const error = new Error("Admin access required");
      error.status = 403;
      throw error;
    }

    if (!user.isVerified) {
      const error = new Error("Email not verified");
      error.status = 403;
      throw error;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      const error = new Error("Invalid email or password");
      error.status = 401;
      throw error;
    }

    const token = require("jsonwebtoken").sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET || "your_jwt_secret_key",
      { expiresIn: "7d" },
    );

    return {
      token,
      userId: user._id,
      user: {
        id: user._id,
        fullname: user.fullname,
        email: user.email,
        role: user.role,
      },
      message: "Admin login successful",
    };
  }

  async getUserReport(userId) {
    const user = await User.findById(userId)
      .select(
        "-password -verificationCode -resetPasswordCode -resetPasswordExpires",
      )
      .lean();

    if (!user) {
      const error = new Error("User not found");
      error.status = 404;
      throw error;
    }

    const [
      profile,
      latestBodyAnalysis,
      weeklyCheckInsCount,
      latestNutritionPlan,
      latestTrainingPlan,
      totalMirrorSessions,
    ] = await Promise.all([
      Profile.findOne({ userId }).lean(),
      BodyAnalysis.findOne({ userId }).sort({ createdAt: -1 }).lean(),
      WeeklyCheckIn.countDocuments({ userId }),
      NutritionPlan.findOne({ user: userId }).sort({ createdAt: -1 }).lean(),
      TrainingPlan.findOne({ userId }).sort({ createdAt: -1 }).lean(),
      MirrorSession.countDocuments({ user: userId }),
    ]);

    const bodyAnalysis = latestBodyAnalysis
      ? {
          current_weight: latestBodyAnalysis.current_weight,
          current_bmi: latestBodyAnalysis.current_bmi,
          bmi_category: latestBodyAnalysis.bmi_category,
          current_muscle_mass: latestBodyAnalysis.current_muscle_mass,
          total_calories_burned: latestBodyAnalysis.total_calories_burned,
          total_time_minutes: latestBodyAnalysis.total_time_minutes,
          total_sessions: latestBodyAnalysis.total_sessions,
          last_session_date: latestBodyAnalysis.last_session_date,
        }
      : null;

    return {
      user,
      profile,
      bodyAnalysis,
      weeklyCheckInsCount,
      nutritionPlanName: latestNutritionPlan
        ? `Week ${latestNutritionPlan.week} Nutrition Plan`
        : null,
      trainingPlanName: latestTrainingPlan
        ? latestTrainingPlan.summary?.trainingStyle || latestTrainingPlan.goal
        : null,
      totalMirrorSessions,
    };
  }

  async createExercise(data) {
    const exercise = await Exercise.create(data);
    await invalidateExerciseCache();
    return exercise;
  }

  async updateExercise(exerciseId, data) {
    const exercise = await Exercise.findByIdAndUpdate(exerciseId, data, {
      new: true,
      runValidators: true,
    });

    if (!exercise) {
      const error = new Error("Exercise not found");
      error.status = 404;
      throw error;
    }

    await invalidateExerciseCache(exerciseId);
    return exercise;
  }

  async deleteExercise(exerciseId) {
    const exercise = await Exercise.findByIdAndDelete(exerciseId);

    if (!exercise) {
      const error = new Error("Exercise not found");
      error.status = 404;
      throw error;
    }

    await invalidateExerciseCache(exerciseId);
    return { message: "Exercise deleted successfully" };
  }

  async getAllReports(page, limit, startDate, endDate) {
    const {
      page: safePage,
      limit: safeLimit,
      skip,
    } = toPagination(page, limit);

    const userFilter = {};
    if (startDate || endDate) {
      userFilter.createdAt = {};
      if (startDate) {
        userFilter.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        userFilter.createdAt.$lte = new Date(endDate);
      }
    }

    const [total, users] = await Promise.all([
      User.countDocuments(userFilter),
      User.find(userFilter)
        .select(
          "-password -verificationCode -resetPasswordCode -resetPasswordExpires",
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean(),
    ]);

    const userIds = users.map((u) => u._id);

    const [profiles, bodyAnalyses, checkInsCounts] = await Promise.all([
      Profile.find({ userId: { $in: userIds } }).lean(),
      BodyAnalysis.find({ userId: { $in: userIds } })
        .sort({ createdAt: -1 })
        .lean(),
      WeeklyCheckIn.aggregate([
        { $match: { userId: { $in: userIds } } },
        { $group: { _id: "$userId", count: { $sum: 1 } } },
      ]),
    ]);

    const profileMap = new Map(profiles.map((p) => [String(p.userId), p]));
    const bodyAnalysisMap = new Map(
      bodyAnalyses.map((b) => [String(b.userId), b]),
    );
    const checkInMap = new Map(
      checkInsCounts.map((c) => [String(c._id), c.count]),
    );

    const reports = users.map((user) => ({
      user,
      profile: profileMap.get(String(user._id)) || null,
      bodyAnalysis: bodyAnalysisMap.get(String(user._id)) || null,
      checkInsCount: checkInMap.get(String(user._id)) || 0,
    }));

    return {
      reports,
      total,
      page: safePage,
      totalPages: Math.ceil(total / safeLimit) || 1,
    };
  }
}

module.exports = new AdminService();
