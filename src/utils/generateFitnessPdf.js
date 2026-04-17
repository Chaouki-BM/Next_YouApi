"use strict";

const PDFDocument = require("pdfkit");
const axios = require("axios");

const LOGO_URL =
  "https://res.cloudinary.com/dpx0kjlbd/image/upload/v1775032996/LogoNextYou_qvdzyx.png";

// ── value formatters ─────────────────────────────────────────────
const fmt = (v, fb = "-") =>
  typeof v === "number" && !Number.isNaN(v) ? v : fb;
const fmtT = (v, fb = "-") =>
  v !== null && v !== undefined && String(v).trim() ? String(v).trim() : fb;

// ── design tokens ────────────────────────────────────────────────
const DARK = "#1a1a2e";
const ORANGE = "#FF5A3C";
const ORANGE2 = "#FF7A3C";
const GRAY = "#6B7280";
const LIGHT = "#F3F4F6";
const BLACK = "#111827";
const LINE = "#E5E7EB";
const WHITE = "#FFFFFF";
const RED = "#E05A5A";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
const CONT_W = PAGE_W - 2 * MARGIN;
const BOTTOM_SAFE = PAGE_H - 60;

// ── low-level draw helpers ───────────────────────────────────────
const fillRect = (doc, x, y, w, h, color) => {
  doc.save().rect(x, y, w, h).fillColor(color).fill().restore();
};

const hline = (doc, x1, x2, y, color = LINE, lw = 0.5) => {
  doc
    .save()
    .moveTo(x1, y)
    .lineTo(x2, y)
    .strokeColor(color)
    .lineWidth(lw)
    .stroke()
    .restore();
};

// ── page break guard ─────────────────────────────────────────────
// All drawing functions use absolute y coordinates (never doc.y).
// ensureSpace adds a new page and redraws the header when needed.
const ensureSpace = (doc, y, needed = 40) => {
  if (y + needed > BOTTOM_SAFE) {
    doc.addPage();
    drawPageHeader(doc);
    return 100; // just below the header
  }
  return y;
};

// ── section label ────────────────────────────────────────────────
const section = (doc, label, y) => {
  doc
    .fillColor(ORANGE)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(label, MARGIN, y);
  return y + 14;
};

// ─────────────────────────────────────────────────────────────────
// tableRow — pure absolute-y, NEVER touches doc.y
// Returns the y coordinate of the next row.
// ─────────────────────────────────────────────────────────────────
const tableRow = (
  doc,
  cells,
  colWidths,
  y,
  { bg = WHITE, textColor = BLACK, bold = false, fontSize = 9 } = {},
) => {
  const ROW_H = 18;
  fillRect(doc, MARGIN, y, CONT_W, ROW_H, bg);
  let cx = MARGIN + 4;
  cells.forEach((cell, i) => {
    doc
      .font(bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(fontSize)
      .fillColor(textColor)
      .text(String(cell ?? "—"), cx, y + 4, {
        width: colWidths[i] - 8,
        lineBreak: false,
      });
    cx += colWidths[i];
  });
  return y + ROW_H;
};

// ── macro progress bar — absolute-y, returns next y ─────────────
const macroBar = (doc, label, value, max, color, y) => {
  const barX = MARGIN + 95;
  const barW = CONT_W - 95 - 60;
  const fill = Math.min(value / (max || 1), 1) * barW;

  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(GRAY)
    .text(label, MARGIN, y + 2, { width: 90 });
  fillRect(doc, barX, y + 4, barW, 8, LIGHT);
  if (fill > 0) fillRect(doc, barX, y + 4, fill, 8, color);
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(BLACK)
    .text(`${value} g`, barX + barW + 8, y + 2, { width: 52, align: "right" });
  return y + 18;
};

// ── repeating page header ────────────────────────────────────────
let _logoBuffer = null;
const drawPageHeader = (doc) => {
  fillRect(doc, 0, 0, PAGE_W, 80, DARK);
  fillRect(doc, 0, 80, PAGE_W, 3, ORANGE);
  if (_logoBuffer) {
    doc.image(_logoBuffer, MARGIN, 18, { width: 44, height: 44 });
  } else {
    fillRect(doc, MARGIN, 18, 44, 44, ORANGE);
    doc
      .fillColor(WHITE)
      .font("Helvetica-Bold")
      .fontSize(14)
      .text("NY", MARGIN + 8, 32);
  }
  doc
    .fillColor(WHITE)
    .font("Helvetica-Bold")
    .fontSize(20)
    .text("Next", MARGIN + 54, 28, { continued: true })
    .fillColor(ORANGE2)
    .text("You");
  doc
    .fillColor("#A2A8B8")
    .font("Helvetica")
    .fontSize(9)
    .text("Fitness Progress Report", MARGIN + 54, 46);
  doc
    .fillColor("#A2A8B8")
    .font("Helvetica")
    .fontSize(9)
    .text(
      `Generated: ${new Date().toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })}`,
      PAGE_W - MARGIN - 120,
      38,
      { width: 120, align: "right" },
    );
};

// ── user block ───────────────────────────────────────────────────
const drawUser = (doc, user, profile) => {
  const y = 100;
  doc
    .circle(MARGIN + 22, y + 22, 22)
    .fillColor(ORANGE)
    .fill();
  const letter = (user?.fullname || user?.firstName || "U")
    .charAt(0)
    .toUpperCase();
  doc
    .fillColor(WHITE)
    .font("Helvetica-Bold")
    .fontSize(18)
    .text(letter, MARGIN + 14, y + 13);

  const fullName = fmtT(
    user?.fullname || `${user?.firstName || ""} ${user?.lastName || ""}`.trim(),
  );
  doc
    .fillColor(BLACK)
    .font("Helvetica-Bold")
    .fontSize(14)
    .text(fullName, MARGIN + 54, y + 10);
  doc
    .fillColor(GRAY)
    .font("Helvetica")
    .fontSize(10)
    .text(fmtT(user?.email), MARGIN + 54, y + 28);

  const infoX = PAGE_W - MARGIN;
  doc.fillColor(GRAY).font("Helvetica").fontSize(9);
  doc.text(`Height: ${fmt(profile?.height, "--")} cm`, infoX - 110, y + 8, {
    width: 110,
    align: "right",
  });
  doc.text(
    `Age: ${fmt(profile?.age_years ?? profile?.age, "--")} yrs`,
    infoX - 110,
    y + 22,
    { width: 110, align: "right" },
  );
  doc.text(
    `Goal: ${fmt(profile?.target_weight, "--")} kg`,
    infoX - 110,
    y + 36,
    { width: 110, align: "right" },
  );

  hline(doc, MARGIN, PAGE_W - MARGIN, y + 56);
  return y + 70;
};

// ── stat cards ───────────────────────────────────────────────────
const drawStatCards = (doc, summary, y) => {
  y = section(doc, "SUMMARY", y);
  const cw = (CONT_W - 12) / 4;
  const ch = 52;
  // Streak uses a text label instead of emoji (Helvetica can't render emoji)
  const cards = [
    [
      `${fmt(summary?.current_weight ?? summary?.currentWeight, "--")} kg`,
      "Current Weight",
    ],
    [
      `${fmt(summary?.current_bmi ?? summary?.bmi, "--")}`,
      `BMI${
        summary?.bmiCategory
          ? " - " + String(summary.bmiCategory).replace(/_/g, " ")
          : ""
      }`,
    ],
    [
      `${(
        summary?.total_calories_burned ??
        summary?.caloriesBurned ??
        0
      ).toLocaleString()}`,
      "Calories Burned",
    ],
    [
      `${fmt(summary?.workout_streak ?? summary?.streak ?? 0, 0)} days`,
      "Day Streak",
    ],
  ];
  cards.forEach(([val, lbl], i) => {
    const cx = MARGIN + i * (cw + 4);
    fillRect(doc, cx, y, cw, ch, LIGHT);
    fillRect(doc, cx, y, cw, 3, ORANGE);
    doc
      .fillColor(BLACK)
      .font("Helvetica-Bold")
      .fontSize(14)
      .text(val, cx, y + 14, { width: cw, align: "center" });
    doc
      .fillColor(GRAY)
      .font("Helvetica")
      .fontSize(8)
      .text(lbl, cx, y + 33, { width: cw, align: "center" });
  });
  return y + ch + 16;
};

// ── weight line chart ────────────────────────────────────────────
const drawLineChart = (doc, weeklyData, startY) => {
  if (!weeklyData || weeklyData.length < 2) return startY;
  startY = section(doc, "WEIGHT PROGRESS", startY);
  const ch = 80,
    cbgH = ch + 32,
    padL = 20;
  fillRect(doc, MARGIN, startY, CONT_W, cbgH, LIGHT);
  doc
    .fillColor(GRAY)
    .font("Helvetica")
    .fontSize(8)
    .text("Weekly weight (kg)", MARGIN + 8, startY + 8);

  const weights = weeklyData.map((d) =>
    Number(d.weight ?? d.current_weight ?? 0),
  );
  const labels = weeklyData.map(
    (d, i) => `W${d.week_number ?? d.week ?? i + 1}`,
  );
  const mn = Math.min(...weights) - 0.5;
  const mx = Math.max(...weights) + 0.5;
  const rng = mx - mn || 1;
  const cw = CONT_W - padL * 2;
  const ox = MARGIN + padL;
  const oy = startY + cbgH - 20;
  const px = (i) => ox + (i / (weights.length - 1)) * cw;
  const py = (v) => oy - ((v - mn) / rng) * ch;

  doc.save().strokeColor(LINE).lineWidth(0.5);
  [0, 1, 2, 3].forEach((i) => {
    const gy = oy - (i / 3) * ch;
    doc
      .moveTo(ox, gy)
      .lineTo(ox + cw, gy)
      .stroke();
  });
  doc.restore();

  for (let i = 0; i < weights.length - 1; i++) {
    const avgY = (py(weights[i]) + py(weights[i + 1])) / 2;
    doc
      .save()
      .rect(px(i), avgY, px(i + 1) - px(i), oy - avgY)
      .fillColor("#FF5A3C")
      .fillOpacity(0.08)
      .fill()
      .restore();
  }
  doc.save().moveTo(px(0), py(weights[0]));
  weights.slice(1).forEach((w, i) => doc.lineTo(px(i + 1), py(w)));
  doc.strokeColor(ORANGE).lineWidth(2).stroke().restore();

  weights.forEach((w, i) => {
    doc.circle(px(i), py(w), 3).fillColor(ORANGE).fill();
    doc
      .fillColor(GRAY)
      .font("Helvetica")
      .fontSize(7)
      .text(labels[i], px(i) - 8, oy + 4, { width: 16, align: "center" });
  });
  doc
    .fillColor(ORANGE)
    .font("Helvetica-Bold")
    .fontSize(8)
    .text(`${weights[0]}`, px(0) - 10, py(weights[0]) - 12, {
      width: 24,
      align: "center",
    })
    .text(
      `${weights[weights.length - 1]}`,
      px(weights.length - 1) - 10,
      py(weights[weights.length - 1]) - 12,
      { width: 24, align: "center" },
    );

  return startY + cbgH + 14;
};

// ── calories bar chart ───────────────────────────────────────────
const drawBarChart = (doc, weeklyData, startY) => {
  if (!weeklyData || weeklyData.length === 0) return startY;
  startY = section(doc, "WEEKLY CALORIES BURNED", startY);
  const ch = 70,
    cbgH = ch + 32;
  fillRect(doc, MARGIN, startY, CONT_W, cbgH, LIGHT);
  doc
    .fillColor(GRAY)
    .font("Helvetica")
    .fontSize(8)
    .text("Calories per week (kcal)", MARGIN + 8, startY + 8);

  const vals = weeklyData.map((d) =>
    Number(d.calories_burned ?? d.caloriesBurned ?? 0),
  );
  const labels = weeklyData.map(
    (d, i) => `W${d.week_number ?? d.week ?? i + 1}`,
  );
  const mxV = Math.max(...vals) || 1;
  const gapSz = (CONT_W - 40) / vals.length;
  const bw = gapSz * 0.6;
  const ox = MARGIN + 20;
  const oy = startY + cbgH - 20;

  vals.forEach((v, i) => {
    const bh = (v / mxV) * ch;
    const bx = ox + i * gapSz + (gapSz - bw) / 2;
    const by = oy - bh;
    doc.rect(bx, by, bw, bh).fillColor(ORANGE2).fill();
    doc
      .fillColor(GRAY)
      .font("Helvetica")
      .fontSize(7)
      .text(labels[i], bx - 2, oy + 4, { width: bw + 4, align: "center" });
    doc
      .fillColor(BLACK)
      .font("Helvetica-Bold")
      .fontSize(7)
      .text(String(v), bx - 4, by - 11, { width: bw + 8, align: "center" });
  });
  return startY + cbgH + 14;
};

// ── weekly breakdown table ───────────────────────────────────────
const drawWeeklyTable = (doc, weeklyData, startY) => {
  startY = section(doc, "WEEKLY BREAKDOWN", startY);
  const ROW_H = 16;
  const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const cw = [
    CONT_W * 0.14,
    CONT_W * 0.18,
    CONT_W * 0.2,
    CONT_W * 0.24,
    CONT_W * 0.24,
  ];
  const headers = ["Week", "Weight", "Muscle", "Calories", "Sessions"];

  fillRect(doc, MARGIN, startY, CONT_W, ROW_H, DARK);
  doc.fillColor(WHITE).font("Helvetica-Bold").fontSize(8);
  let x0 = MARGIN + 4;
  headers.forEach((h, i) => {
    if (i === 0) doc.text(h, x0, startY + 4, { width: cw[i] });
    else doc.text(h, x0, startY + 4, { width: cw[i] - 8, align: "right" });
    x0 += cw[i];
  });
  startY += ROW_H;

  (weeklyData || []).forEach((row, ri) => {
    fillRect(doc, MARGIN, startY, CONT_W, ROW_H, ri % 2 === 0 ? LIGHT : WHITE);
    doc.fillColor(BLACK).font("Helvetica").fontSize(8);
    x0 = MARGIN + 4;
    const mon = row.month ? MONTHS[(row.month ?? 1) - 1] : "";
    const vals = [
      row.date
        ? new Date(row.date).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
          })
        : `${mon} W${row.week_number ?? row.week ?? ri + 1}`,
      `${fmt(row.weight, "--")} kg`,
      `${fmt(row.muscle_mass, "--")} kg`,
      `${fmt(row.calories_burned ?? row.caloriesBurned, 0)} kcal`,
      String(row.sessions_count ?? row.sessions ?? 0),
    ];
    vals.forEach((v, i) => {
      if (i === 0) doc.text(v, x0, startY + 4, { width: cw[i] });
      else doc.text(v, x0, startY + 4, { width: cw[i] - 8, align: "right" });
      x0 += cw[i];
    });
    hline(doc, MARGIN, MARGIN + CONT_W, startY + ROW_H, LINE, 0.3);
    startY += ROW_H;
  });
  return startY + 14;
};

// ── recent workouts table ────────────────────────────────────────
const drawWorkoutHistory = (doc, sessions, startY) => {
  startY = section(doc, "RECENT WORKOUTS", startY);
  const ROW_H = 16;
  const cw = [
    CONT_W * 0.28,
    CONT_W * 0.14,
    CONT_W * 0.12,
    CONT_W * 0.22,
    CONT_W * 0.24,
  ];
  const headers = ["Exercise", "Reps", "Sets", "Calories", "Date"];

  fillRect(doc, MARGIN, startY, CONT_W, ROW_H, DARK);
  doc.fillColor(WHITE).font("Helvetica-Bold").fontSize(8);
  let x0 = MARGIN + 4;
  headers.forEach((h, i) => {
    if (i === 0) doc.text(h, x0, startY + 4, { width: cw[i] });
    else doc.text(h, x0, startY + 4, { width: cw[i] - 8, align: "right" });
    x0 += cw[i];
  });
  startY += ROW_H;

  (sessions || []).slice(0, 10).forEach((w, ri) => {
    fillRect(doc, MARGIN, startY, CONT_W, ROW_H, ri % 2 === 0 ? LIGHT : WHITE);
    doc.fillColor(BLACK).font("Helvetica").fontSize(8);
    x0 = MARGIN + 4;
    const date =
      w.completedAt || w.date
        ? new Date(w.completedAt || w.date).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        : fmtT(w.date, "--");
    const vals = [
      fmtT(w.name || w.exerciseName),
      String(fmt(w.reps_done ?? w.reps, 0)),
      String(fmt(w.sets_done ?? w.sets, 0)),
      `${fmt(w.calories_burned ?? w.caloriesBurned, 0)} kcal`,
      date,
    ];
    vals.forEach((v, i) => {
      if (i === 0) doc.text(v, x0, startY + 4, { width: cw[i] });
      else doc.text(v, x0, startY + 4, { width: cw[i] - 8, align: "right" });
      x0 += cw[i];
    });
    hline(doc, MARGIN, MARGIN + CONT_W, startY + ROW_H, LINE, 0.3);
    startY += ROW_H;
  });
  return startY + 14;
};

// ── nutrition plan ───────────────────────────────────────────────
const drawNutritionPlan = (doc, nutritionPlan, startY) => {
  if (!nutritionPlan) return startY;

  startY = section(doc, "NUTRITION PLAN", startY);
  const { dailyTargets, mealPlan, week } = nutritionPlan;

  // Daily targets card
  if (dailyTargets) {
    const cardH = 54;
    startY = ensureSpace(doc, startY, cardH + 70);
    fillRect(doc, MARGIN, startY, CONT_W, cardH, LIGHT);

    doc
      .fillColor(ORANGE2)
      .font("Helvetica-Bold")
      .fontSize(18)
      .text(`${fmt(dailyTargets.calories, "--")}`, MARGIN + 12, startY + 8);
    doc
      .fillColor(GRAY)
      .font("Helvetica")
      .fontSize(9)
      .text("kcal / day", MARGIN + 12, startY + 30);
    doc
      .fillColor(GRAY)
      .font("Helvetica-Bold")
      .fontSize(8)
      .text("BMR", MARGIN + 110, startY + 10);
    doc
      .fillColor(BLACK)
      .font("Helvetica")
      .fontSize(10)
      .text(`${fmt(dailyTargets.bmr, "--")} kcal`, MARGIN + 110, startY + 22);
    doc
      .fillColor(GRAY)
      .font("Helvetica-Bold")
      .fontSize(8)
      .text("TDEE", MARGIN + 200, startY + 10);
    doc
      .fillColor(BLACK)
      .font("Helvetica")
      .fontSize(10)
      .text(`${fmt(dailyTargets.tdee, "--")} kcal`, MARGIN + 200, startY + 22);

    startY += cardH + 8;

    const totalG =
      Number(dailyTargets.protein ?? 0) +
      Number(dailyTargets.carbs ?? 0) +
      Number(dailyTargets.fats ?? 0);

    startY = macroBar(
      doc,
      "Protein",
      Number(dailyTargets.protein ?? 0),
      totalG,
      ORANGE,
      startY,
    );
    startY = macroBar(
      doc,
      "Carbohydrates",
      Number(dailyTargets.carbs ?? 0),
      totalG,
      ORANGE2,
      startY,
    );
    startY = macroBar(
      doc,
      "Fats",
      Number(dailyTargets.fats ?? 0),
      totalG,
      GRAY,
      startY,
    );
    startY += 6;
  }

  // Week label
  if (week != null) {
    startY = ensureSpace(doc, startY, 20);
    doc
      .fillColor(GRAY)
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(`Week ${week}`, MARGIN, startY);
    startY += 14;
  }

  if (!Array.isArray(mealPlan) || mealPlan.length === 0) {
    doc
      .fillColor(GRAY)
      .font("Helvetica")
      .fontSize(9)
      .text("No meal plan available.", MARGIN, startY);
    return startY + 14;
  }

  const mealCols = [140, 65, 55, 55, 55, 145];

  mealPlan.forEach((dayPlan, dayIndex) => {
    startY = ensureSpace(doc, startY, 60);

    // Day header
    fillRect(doc, MARGIN, startY, CONT_W, 20, WHITE);
    doc
      .fillColor(ORANGE)
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(dayPlan.day ?? `Day ${dayIndex + 1}`, MARGIN + 8, startY + 4);
    doc
      .fillColor(GRAY)
      .font("Helvetica")
      .fontSize(8)
      .text(
        `${fmt(dayPlan.totalCalories, "--")} kcal total`,
        MARGIN + 180,
        startY + 5,
      );
    startY += 22;

    // Table header
    startY = tableRow(
      doc,
      ["Meal", "Calories", "Protein", "Carbs", "Fats", "Foods"],
      mealCols,
      startY,
      { bg: DARK, textColor: WHITE, bold: true, fontSize: 8 },
    );

    (dayPlan.meals || []).forEach((meal, mi) => {
      startY = ensureSpace(doc, startY, 20);
      if (typeof meal === "string" || !meal?.name) {
        startY = tableRow(
          doc,
          ["(ref)", "—", "—", "—", "—", "—"],
          mealCols,
          startY,
          { bg: mi % 2 === 0 ? LIGHT : WHITE, fontSize: 8 },
        );
        return;
      }
      const foods = Array.isArray(meal.foods) ? meal.foods.join(", ") : "—";
      startY = tableRow(
        doc,
        [
          meal.name,
          `${fmt(meal.calories, "--")} kcal`,
          `${fmt(meal.protein, "--")} g`,
          `${fmt(meal.carbs, "--")} g`,
          `${fmt(meal.fats, "--")} g`,
          foods,
        ],
        mealCols,
        startY,
        { bg: mi % 2 === 0 ? LIGHT : WHITE, fontSize: 8 },
      );
    });

    startY += 10;
  });

  return startY;
};

// ── training plan ────────────────────────────────────────────────
const drawTrainingPlan = (doc, trainingPlan, startY) => {
  if (!trainingPlan) return startY;

  startY = section(doc, "TRAINING PLAN", startY);
  const {
    goal,
    level,
    daysPerWeek,
    splitType,
    durationWeeks,
    targetWeight,
    bmiCategory,
    calorieTarget,
    summary: planSummary,
    weeklyPlan,
    progressionPlan,
    safetyNotes,
  } = trainingPlan;

  // Overview grid
  const overviewRows = [
    ["Goal", fmtT(String(goal || "").replace(/_/g, " "))],
    ["Level", fmtT(level)],
    ["Split Type", fmtT(String(splitType || "").replace(/_/g, " "))],
    ["Days / Week", fmt(daysPerWeek, "--")],
    ["Duration", durationWeeks ? `${durationWeeks} weeks` : "--"],
    ["Target Weight", targetWeight ? `${targetWeight} kg` : "--"],
    ["BMI Category", fmtT(String(bmiCategory || "").replace(/_/g, " "))],
    ["Calorie Target", calorieTarget ? `${calorieTarget} kcal` : "--"],
  ];
  if (planSummary) {
    if (planSummary.trainingStyle)
      overviewRows.push(["Training Style", planSummary.trainingStyle]);
    if (planSummary.sessionDuration)
      overviewRows.push([
        "Session Duration",
        `${planSummary.sessionDuration} min`,
      ]);
  }

  overviewRows.forEach(([k, v], i) => {
    startY = ensureSpace(doc, startY, 20);
    fillRect(doc, MARGIN, startY, CONT_W, 18, i % 2 === 0 ? LIGHT : WHITE);
    doc
      .fillColor(GRAY)
      .font("Helvetica-Bold")
      .fontSize(8)
      .text(k, MARGIN + 8, startY + 4, { width: 160 });
    doc
      .fillColor(BLACK)
      .font("Helvetica")
      .fontSize(9)
      .text(String(v), MARGIN + 170, startY + 4, { width: CONT_W - 178 });
    startY += 20;
  });

  // Weekly workout days
  if (Array.isArray(weeklyPlan) && weeklyPlan.length) {
    startY += 4;
    weeklyPlan.forEach((dayPlan) => {
      startY = ensureSpace(doc, startY, 60);

      fillRect(doc, MARGIN, startY, CONT_W, 20, "#FEF5E7");
      doc
        .fillColor(ORANGE)
        .font("Helvetica-Bold")
        .fontSize(10)
        .text(
          `Day ${fmt(dayPlan.day, "?")} - ${fmtT(dayPlan.focus)}`,
          MARGIN + 8,
          startY + 4,
          { continued: true },
        );
      const meta = [];
      if (dayPlan.duration) meta.push(`${dayPlan.duration} min`);
      if (dayPlan.estimatedCalories)
        meta.push(`~${dayPlan.estimatedCalories} kcal`);
      if (meta.length) {
        doc
          .fillColor(GRAY)
          .font("Helvetica")
          .fontSize(8)
          .text(`  .  ${meta.join("  .  ")}`, { lineBreak: false });
      }
      startY += 24;

      const drawBlock = (label, exercises, isMain = false) => {
        if (!exercises?.length) return;
        startY = ensureSpace(doc, startY, isMain ? 60 : 36);
        doc
          .fillColor(isMain ? DARK : GRAY)
          .font("Helvetica-Bold")
          .fontSize(9)
          .text(label, MARGIN, startY);
        startY += 12;

        if (isMain) {
          const eCols = [150, 55, 65, 65, 80, 100];
          startY = tableRow(
            doc,
            ["Exercise", "Sets", "Reps", "Rest", "Category", ""],
            eCols,
            startY,
            { bg: DARK, textColor: WHITE, bold: true, fontSize: 8 },
          );
          exercises.forEach((ex, ei) => {
            startY = ensureSpace(doc, startY, 20);
            startY = tableRow(
              doc,
              [
                ex.name ?? "—",
                ex.sets ?? "—",
                ex.reps ?? "—",
                ex.rest ?? "—",
                ex.category ?? "—",
                "",
              ],
              eCols,
              startY,
              { bg: ei % 2 === 0 ? LIGHT : WHITE, fontSize: 8 },
            );
          });
        } else {
          exercises.forEach((ex, ei) => {
            startY = ensureSpace(doc, startY, 18);
            fillRect(
              doc,
              MARGIN + 8,
              startY,
              CONT_W - 8,
              16,
              ei % 2 === 0 ? LIGHT : WHITE,
            );
            doc
              .fillColor(BLACK)
              .font("Helvetica")
              .fontSize(8)
              .text(ex.name ?? "—", MARGIN + 16, startY + 3, {
                continued: !!ex.duration,
                width: 240,
              });
            if (ex.duration) {
              doc
                .fillColor(GRAY)
                .font("Helvetica-Bold")
                .fontSize(8)
                .text(`  ${ex.duration}`, { lineBreak: false });
            }
            startY += 18;
          });
        }
        startY += 4;
      };

      drawBlock("Warm-Up", dayPlan.warmUp, false);
      drawBlock("Main Workout", dayPlan.mainWorkout, true);
      drawBlock("Cardio", dayPlan.cardio, false);
      drawBlock("Cool-Down", dayPlan.cooldown, false);
      startY += 8;
    });
  }

  // Progression plan
  if (progressionPlan && Object.values(progressionPlan).some(Boolean)) {
    startY = ensureSpace(doc, startY, 100);
    startY += 4;
    doc
      .fillColor(ORANGE)
      .font("Helvetica-Bold")
      .fontSize(9)
      .text("Progression Plan", MARGIN, startY);
    startY += 14;
    ["week1", "week2", "week3", "week4"].forEach((wk, i) => {
      if (!progressionPlan[wk]) return;
      startY = ensureSpace(doc, startY, 22);
      fillRect(doc, MARGIN, startY, CONT_W, 20, i % 2 === 0 ? LIGHT : WHITE);
      doc
        .fillColor(ORANGE)
        .font("Helvetica-Bold")
        .fontSize(8)
        .text(`Week ${i + 1}`, MARGIN + 8, startY + 5, { width: 55 });
      doc
        .fillColor(BLACK)
        .font("Helvetica")
        .fontSize(8)
        .text(progressionPlan[wk], MARGIN + 66, startY + 5, {
          width: CONT_W - 74,
        });
      startY += 22;
    });
  }

  // Safety notes
  if (Array.isArray(safetyNotes) && safetyNotes.length) {
    startY = ensureSpace(doc, startY, 60);
    startY += 4;
    doc
      .fillColor(RED)
      .font("Helvetica-Bold")
      .fontSize(9)
      .text("Safety Notes", MARGIN, startY);
    startY += 14;
    safetyNotes.forEach((note, i) => {
      startY = ensureSpace(doc, startY, 20);
      fillRect(
        doc,
        MARGIN,
        startY,
        CONT_W,
        18,
        i % 2 === 0 ? "#FFF0F0" : WHITE,
      );
      doc
        .fillColor(RED)
        .font("Helvetica-Bold")
        .fontSize(10)
        .text("*", MARGIN + 8, startY + 3, { lineBreak: false });
      doc
        .fillColor(BLACK)
        .font("Helvetica")
        .fontSize(8)
        .text(note, MARGIN + 22, startY + 4, { width: CONT_W - 30 });
      startY += 20;
    });
  }

  return startY;
};

// ── footers (drawn once after all pages are buffered) ────────────
const drawFooters = (doc) => {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    fillRect(doc, 0, PAGE_H - 36, PAGE_W, 36, DARK);
    doc
      .fillColor(ORANGE2)
      .font("Helvetica-Bold")
      .fontSize(9)
      .text("NextYou", 0, PAGE_H - 26, { width: PAGE_W, align: "center" });
    doc
      .fillColor("#888888")
      .font("Helvetica")
      .fontSize(8)
      .text(
        "Your AI Fitness Coach  .  (c) 2026 NextYou  .  nextyou.app",
        0,
        PAGE_H - 14,
        { width: PAGE_W, align: "center" },
      );
  }
};

// ── normalisation ────────────────────────────────────────────────
const normalizeSummary = (s) => ({
  current_weight: s?.current_weight ?? s?.currentWeight,
  current_bmi: s?.current_bmi ?? s?.bmi,
  total_calories_burned: s?.total_calories_burned ?? s?.caloriesBurned ?? 0,
  workout_streak: s?.workout_streak ?? s?.streak ?? 0,
  bmiCategory: s?.bmiCategory,
});

const normalizeWeeklyData = (wd) =>
  (wd || []).map((row, i) => ({
    week_number: row.week_number ?? row.week ?? i + 1,
    month: row.month,
    date: row.date,
    weight: row.weight,
    muscle_mass: row.muscle_mass ?? row.muscleMass,
    calories_burned: row.calories_burned ?? row.caloriesBurned,
    sessions_count: row.sessions_count ?? row.sessions,
  }));

const normalizeSessions = (sessions) =>
  (sessions || []).map((s) => ({
    name: s.name ?? s.exerciseName,
    reps_done: s.reps_done ?? s.reps,
    sets_done: s.sets_done ?? s.sets,
    calories_burned: s.calories_burned ?? s.caloriesBurned,
    completedAt: s.completedAt ?? s.date,
    date: s.date,
  }));

// ── main export ──────────────────────────────────────────────────
const generateFitnessPdf = async ({
  user,
  profile,
  summary,
  weeklyData,
  sessions,
  nutritionPlan,
  trainingPlan,
}) => {
  try {
    const res = await axios.get(LOGO_URL, { responseType: "arraybuffer" });
    _logoBuffer = Buffer.from(res.data, "binary");
  } catch (_) {
    _logoBuffer = null;
  }

  const nSummary = normalizeSummary(summary);
  const nWeekly = normalizeWeeklyData(weeklyData);
  const nSessions = normalizeSessions(sessions);
  const nNutrition = nutritionPlan
    ? {
        ...nutritionPlan,
        mealPlan: Array.isArray(nutritionPlan.mealPlan)
          ? nutritionPlan.mealPlan.map((dp) => ({
              ...dp,
              meals: Array.isArray(dp.meals) ? dp.meals : [],
            }))
          : [],
      }
    : null;
  const nTraining = trainingPlan ? { ...trainingPlan } : null;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 0,
      autoFirstPage: true,
      bufferPages: true,
    });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Page 1 — fitness stats
    drawPageHeader(doc);
    let y = drawUser(doc, user, profile);
    y = drawStatCards(doc, nSummary, y);
    y = ensureSpace(doc, y, 120);
    y = drawLineChart(doc, nWeekly, y);
    y = ensureSpace(doc, y, 120);
    y = drawBarChart(doc, nWeekly, y);
    y = ensureSpace(doc, y, 100);
    y = drawWeeklyTable(doc, nWeekly, y);
    y = ensureSpace(doc, y, 100);
    y = drawWorkoutHistory(doc, nSessions, y);

    // Nutrition plan starts on its own page
    doc.addPage();
    drawPageHeader(doc);
    y = drawNutritionPlan(doc, nNutrition, 100);

    // Training plan starts on its own page
    doc.addPage();
    drawPageHeader(doc);
    y = drawTrainingPlan(doc, nTraining, 100);

    // Stamp footer on every buffered page
    drawFooters(doc);
    doc.end();
  });
};

module.exports = generateFitnessPdf;
module.exports.generateFitnessPdf = generateFitnessPdf;
