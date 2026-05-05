const mongoose = require("mongoose");
const User = require("../models/User.model");
const BodyAnalysis = require("../models/BodyAnalysis.model");
const WeeklyCheckIn = require("../models/WeeklyCheckIn.model");
const { calculateMetrics, getWeekNumber } = require("../utils/bodyMetrics");

// Get or create the BodyAnalysis summary for a user.
async function createOrGetBodyAnalysis(userId) {
  const user = await User.findById(userId).populate("profile");
  if (!user) {
    throw new Error("User not found");
  }
  const profile = user.profile;

  let bodyAnalysis = await BodyAnalysis.findOne({ userId });

  if (!bodyAnalysis) {
    const { bmi, muscle_mass, bmi_category } = calculateMetrics({
      weightKg: profile.weight,
      heightCm: profile.height,
      age: profile.age_years,
      gender: profile.sex,
    });

    bodyAnalysis = await BodyAnalysis.create({
      userId,
      current_weight: profile.weight,
      current_bmi: bmi,
      bmi_category,
      current_muscle_mass: muscle_mass,
      goal_weight: profile.target_weight ?? null,
    });
  }

  return bodyAnalysis;
}

// Save weekly weight entry and update body analysis summary.
async function submitWeeklyCheckIn(userId, { weight }) {
  const user = await User.findById(userId).populate("profile");
  if (!user) {
    throw new Error("User not found");
  }
  const profile = user.profile;

  const { bmi, muscle_mass, bmi_category } = calculateMetrics({
    weightKg: weight,
    heightCm: profile.height,
    age: profile.age_years,
    gender: profile.sex,
  });

  const now = new Date();
  const week_number = getWeekNumber(now);
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const checkIn = await WeeklyCheckIn.findOneAndUpdate(
    { userId, week_number, year },
    {
      $set: {
        weight,
        bmi,
        muscle_mass,
        date: now,
        month,
        source: "manual",
      },
    },
    { upsert: true, returnDocument: "after" },
  );

  const previous = await BodyAnalysis.findOne({ userId });
  const previousWeight = previous?.current_weight ?? weight;

  const bodyAnalysis = await BodyAnalysis.findOneAndUpdate(
    { userId },
    {
      $set: {
        current_weight: weight,
        current_bmi: bmi,
        bmi_category,
        current_muscle_mass: muscle_mass,
        goal_weight: profile.target_weight ?? null,
        // is_weight_lost: weight < previousWeight,
      },
    },
    { upsert: true, returnDocument: "after" },
  );

  return { checkIn, bodyAnalysis };
}

// Return last 12 weekly check-ins for chart display.
async function getWeeklyChart(userId) {
  return await WeeklyCheckIn.find({ userId })
    .sort({ date: 1 })
    .limit(12)
    .select(
      "date week_number month year weight bmi muscle_mass calories_burned time_minutes sessions_count",
    );
}

// Aggregate weekly data by month for monthly chart.
async function getMonthlyChart(userId) {
  return await WeeklyCheckIn.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: { month: "$month", year: "$year" },
        avg_weight: { $avg: "$weight" },
        avg_muscle_mass: { $avg: "$muscle_mass" },
        avg_bmi: { $avg: "$bmi" },
        total_calories: { $sum: "$calories_burned" },
        total_time: { $sum: "$time_minutes" },
        total_sessions: { $sum: "$sessions_count" },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1 } },
    {
      $project: {
        _id: 0,
        month: "$_id.month",
        year: "$_id.year",
        avg_weight: { $round: ["$avg_weight", 1] },
        avg_muscle_mass: { $round: ["$avg_muscle_mass", 1] },
        avg_bmi: { $round: ["$avg_bmi", 1] },
        total_calories: 1,
        total_time: 1,
        total_sessions: 1,
      },
    },
  ]);
}

// Update weekly and total session metrics after an exercise session stops.
async function updateSessionTotals(userId, { calories, duration_sec }) {
  const now = new Date();
  const week_number = getWeekNumber(now);
  const year = now.getFullYear();
  const timeMinutes = Math.round(duration_sec / 60);

  await WeeklyCheckIn.findOneAndUpdate(
    { userId, week_number, year },
    {
      $inc: {
        calories_burned: calories,
        time_minutes: timeMinutes,
        sessions_count: 1,
      },
    },
    { upsert: false, returnDocument: "after" },
  );

  const current = await BodyAnalysis.findOne({ userId });

  const today = new Date(now.toDateString());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  let newStreak = 1;
  if (current?.last_session_date) {
    const lastDate = new Date(current.last_session_date.toDateString());
    if (lastDate.getTime() === today.getTime()) {
      newStreak = current.workout_streak;
    } else if (lastDate.getTime() === yesterday.getTime()) {
      newStreak = current.workout_streak + 1;
    } else {
      newStreak = 1;
    }
  }

  const newLongest = Math.max(newStreak, current?.longest_streak ?? 0);

  const updated = await BodyAnalysis.findOneAndUpdate(
    { userId },
    {
      $inc: {
        total_calories_burned: calories,
        total_time_minutes: timeMinutes,
        total_sessions: 1,
      },
      $set: {
        workout_streak: newStreak,
        longest_streak: newLongest,
        last_session_date: today,
      },
    },
    { returnDocument: "after" },
  );

  return updated;
}

module.exports = {
  createOrGetBodyAnalysis,
  submitWeeklyCheckIn,
  getWeeklyChart,
  getMonthlyChart,
  updateSessionTotals,
};
