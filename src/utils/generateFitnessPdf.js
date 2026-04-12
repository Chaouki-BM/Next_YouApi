const PDFDocument = require("pdfkit");
const axios = require("axios");

const LOGO_URL =
  "https://res.cloudinary.com/dpx0kjlbd/image/upload/v1775032996/LogoNextYou_qvdzyx.png";

// ── helpers ──────────────────────────────────────────────────────
const fmt = (v, fb = "-") =>
  typeof v === "number" && !Number.isNaN(v) ? v : fb;
const fmtT = (v, fb = "-") =>
  v !== null && v !== undefined && String(v).trim() ? String(v).trim() : fb;

const DARK = "#1a1a2e";
const ORANGE = "#FF5A3C";
const ORANGE2 = "#FF7A3C";
const GRAY = "#6B7280";
const LIGHT = "#F3F4F6";
const BLACK = "#111827";
const LINE = "#E5E7EB";
const WHITE = "#FFFFFF";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
const CONT_W = PAGE_W - 2 * MARGIN;

// ── draw helpers ─────────────────────────────────────────────────
const rect = (doc, x, y, w, h, fill, stroke, lw = 0) => {
  if (fill) doc.fillColor(fill);
  if (stroke) doc.strokeColor(stroke).lineWidth(lw);
  doc.rect(x, y, w, h);
  if (fill && stroke) doc.fillAndStroke();
  else if (fill) doc.fill();
  else if (stroke) doc.stroke();
};

const hline = (doc, x1, x2, y, color = LINE, lw = 0.5) => {
  doc.moveTo(x1, y).lineTo(x2, y).strokeColor(color).lineWidth(lw).stroke();
};

// ── header ───────────────────────────────────────────────────────
const drawHeader = (doc, user, logoBuffer) => {
  // dark bg
  rect(doc, 0, 0, PAGE_W, 80, DARK);
  // orange bottom strip
  rect(doc, 0, 80, PAGE_W, 3, ORANGE);

  // logo image or fallback box
  if (logoBuffer) {
    doc.image(logoBuffer, MARGIN, 18, { width: 44, height: 44 });
  } else {
    rect(doc, MARGIN, 18, 44, 44, ORANGE);
    doc
      .fillColor(WHITE)
      .font("Helvetica-Bold")
      .fontSize(14)
      .text("NY", MARGIN + 8, 32);
  }

  // brand
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

  // date
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

// ── user section ─────────────────────────────────────────────────
const drawUser = (doc, user, profile) => {
  let y = 100;

  // avatar circle
  doc
    .circle(MARGIN + 22, y + 22, 22)
    .fillColor(ORANGE)
    .fill();
  const letter = (user?.fullname || "U").charAt(0).toUpperCase();
  doc
    .fillColor(WHITE)
    .font("Helvetica-Bold")
    .fontSize(18)
    .text(letter, MARGIN + 14, y + 13);

  // name + email
  doc
    .fillColor(BLACK)
    .font("Helvetica-Bold")
    .fontSize(14)
    .text(fmtT(user?.fullname), MARGIN + 54, y + 10);
  doc
    .fillColor(GRAY)
    .font("Helvetica")
    .fontSize(10)
    .text(fmtT(user?.email), MARGIN + 54, y + 28);

  // right side info
  doc.fillColor(GRAY).font("Helvetica").fontSize(9);
  const infoX = PAGE_W - MARGIN;
  doc.text(`Height: ${fmt(profile?.height, "--")} cm`, infoX - 110, y + 8, {
    width: 110,
    align: "right",
  });
  doc.text(`Age: ${fmt(profile?.age_years, "--")} yrs`, infoX - 110, y + 22, {
    width: 110,
    align: "right",
  });
  doc.text(
    `Goal: ${fmt(profile?.target_weight, "--")} kg`,
    infoX - 110,
    y + 36,
    { width: 110, align: "right" },
  );

  hline(doc, MARGIN, PAGE_W - MARGIN, y + 56);
  return y + 70;
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

// ── stat cards ───────────────────────────────────────────────────
const drawStatCards = (doc, summary, y) => {
  y = section(doc, "SUMMARY", y);
  const cw = (CONT_W - 12) / 4;
  const ch = 52;
  const cards = [
    [`${fmt(summary?.current_weight, "--")} kg`, "Current Weight"],
    [`${fmt(summary?.current_bmi, "--")}`, "BMI · Normal"],
    [
      `${(summary?.total_calories_burned || 0).toLocaleString()}`,
      "Calories Burned",
    ],
    [`${fmt(summary?.workout_streak, 0)} 🔥`, "Day Streak"],
  ];
  cards.forEach(([val, lbl], i) => {
    const cx = MARGIN + i * (cw + 4);
    const cy = y;
    rect(doc, cx, cy, cw, ch, LIGHT);
    rect(doc, cx, cy, cw, 3, ORANGE);
    doc
      .fillColor(BLACK)
      .font("Helvetica-Bold")
      .fontSize(14)
      .text(val, cx, cy + 14, { width: cw, align: "center" });
    doc
      .fillColor(GRAY)
      .font("Helvetica")
      .fontSize(8)
      .text(lbl, cx, cy + 33, { width: cw, align: "center" });
  });
  return y + ch + 16;
};

// ── line chart ───────────────────────────────────────────────────
const drawLineChart = (doc, weeklyData, startY) => {
  if (!weeklyData || weeklyData.length < 2) return startY;
  startY = section(doc, "WEIGHT PROGRESS", startY);

  const ch = 80,
    cbgH = ch + 32,
    padL = 20,
    padT = 10;
  rect(doc, MARGIN, startY, CONT_W, cbgH, LIGHT);
  doc
    .fillColor(GRAY)
    .font("Helvetica")
    .fontSize(8)
    .text("Weekly weight (kg)", MARGIN + 8, startY + 8);

  const weights = weeklyData.map((d) => d.weight ?? 0);
  const labels = weeklyData.map((d, i) => `W${d.week_number ?? i + 1}`);
  const mn = Math.min(...weights) - 0.5;
  const mx = Math.max(...weights) + 0.5;
  const rng = mx - mn || 1;
  const cw = CONT_W - padL * 2;
  const ox = MARGIN + padL;
  const oy = startY + cbgH - 20;

  const px = (i) => ox + (i / (weights.length - 1)) * cw;
  const py = (v) => oy - ((v - mn) / rng) * ch;

  // grid lines
  doc.strokeColor(LINE).lineWidth(0.5);
  [0, 1, 2, 3].forEach((i) => {
    const gy = oy - (i / 3) * ch;
    doc
      .moveTo(ox, gy)
      .lineTo(ox + cw, gy)
      .stroke();
  });

  // area fill - approximate with rect blocks
  for (let i = 0; i < weights.length - 1; i++) {
    const x1 = px(i),
      x2 = px(i + 1);
    const y1 = py(weights[i]),
      y2 = py(weights[i + 1]);
    const avgY = (y1 + y2) / 2;
    doc
      .rect(x1, avgY, x2 - x1, oy - avgY)
      .fillColor("#FF5A3C")
      .fillOpacity(0.08)
      .fill();
  }
  doc.fillOpacity(1);

  // line
  doc.moveTo(px(0), py(weights[0]));
  weights.slice(1).forEach((w, i) => doc.lineTo(px(i + 1), py(w)));
  doc.strokeColor(ORANGE).lineWidth(2).stroke();

  // dots + labels
  weights.forEach((w, i) => {
    doc.circle(px(i), py(w), 3).fillColor(ORANGE).fill();
    doc
      .fillColor(GRAY)
      .font("Helvetica")
      .fontSize(7)
      .text(labels[i], px(i) - 8, oy + 4, { width: 16, align: "center" });
  });

  // first + last value
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

// ── bar chart ─────────────────────────────────────────────────────
const drawBarChart = (doc, weeklyData, startY) => {
  if (!weeklyData || weeklyData.length === 0) return startY;
  startY = section(doc, "WEEKLY CALORIES BURNED", startY);

  const ch = 70,
    cbgH = ch + 32;
  rect(doc, MARGIN, startY, CONT_W, cbgH, LIGHT);
  doc
    .fillColor(GRAY)
    .font("Helvetica")
    .fontSize(8)
    .text("Calories per week (kcal)", MARGIN + 8, startY + 8);

  const vals = weeklyData.map((d) => d.calories_burned ?? 0);
  const labels = weeklyData.map((d, i) => `W${d.week_number ?? i + 1}`);
  const mx = Math.max(...vals) || 1;
  const gap = (CONT_W - 40) / vals.length;
  const bw = gap * 0.6;
  const ox = MARGIN + 20;
  const oy = startY + cbgH - 20;

  vals.forEach((v, i) => {
    const bh = (v / mx) * ch;
    const bx = ox + i * gap + (gap - bw) / 2;
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

// ── weekly table ──────────────────────────────────────────────────
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

  // header row
  rect(doc, MARGIN, startY, CONT_W, ROW_H, DARK);
  doc.fillColor(WHITE).font("Helvetica-Bold").fontSize(8);
  let x0 = MARGIN + 4;
  headers.forEach((h, i) => {
    if (i === 0) doc.text(h, x0, startY + 4, { width: cw[i] });
    else doc.text(h, x0, startY + 4, { width: cw[i] - 8, align: "right" });
    x0 += cw[i];
  });
  startY += ROW_H;

  (weeklyData || []).forEach((row, ri) => {
    rect(doc, MARGIN, startY, CONT_W, ROW_H, ri % 2 === 0 ? LIGHT : WHITE);
    doc.fillColor(BLACK).font("Helvetica").fontSize(8);
    x0 = MARGIN + 4;
    const mon = MONTHS[(row.month ?? 1) - 1];
    const vals = [
      `${mon} W${row.week_number ?? ri + 1}`,
      `${fmt(row.weight, "--")} kg`,
      `${fmt(row.muscle_mass, "--")} kg`,
      `${fmt(row.calories_burned, 0)} kcal`,
      String(row.sessions_count ?? 0),
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

// ── workout history ───────────────────────────────────────────────
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

  // header
  rect(doc, MARGIN, startY, CONT_W, ROW_H, DARK);
  doc.fillColor(WHITE).font("Helvetica-Bold").fontSize(8);
  let x0 = MARGIN + 4;
  headers.forEach((h, i) => {
    if (i === 0) doc.text(h, x0, startY + 4, { width: cw[i] });
    else doc.text(h, x0, startY + 4, { width: cw[i] - 8, align: "right" });
    x0 += cw[i];
  });
  startY += ROW_H;

  (sessions || []).slice(0, 10).forEach((w, ri) => {
    rect(doc, MARGIN, startY, CONT_W, ROW_H, ri % 2 === 0 ? LIGHT : WHITE);
    doc.fillColor(BLACK).font("Helvetica").fontSize(8);
    x0 = MARGIN + 4;
    const date = w.completedAt
      ? new Date(w.completedAt).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : fmtT(w.date, "--");
    const vals = [
      fmtT(w.name),
      String(fmt(w.reps_done, 0)),
      String(fmt(w.sets_done, 0)),
      `${fmt(w.calories_burned, 0)} kcal`,
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

// ── footer ────────────────────────────────────────────────────────
const drawFooter = (doc) => {
  rect(doc, 0, PAGE_H - 36, PAGE_W, 36, DARK);
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
      "Your AI Fitness Coach  ·  © 2026 NextYou  ·  nextyou.app",
      0,
      PAGE_H - 14,
      { width: PAGE_W, align: "center" },
    );
};

// ── page break check ──────────────────────────────────────────────
const ensureSpace = (doc, y, needed = 40) => {
  if (y + needed > PAGE_H - 60) {
    doc.addPage();
    return MARGIN;
  }
  return y;
};

// ═══════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════
const generateFitnessPdf = async ({
  user,
  profile,
  summary,
  weeklyData,
  sessions,
}) => {
  let logoBuffer = null;
  try {
    const res = await axios.get(LOGO_URL, { responseType: "arraybuffer" });
    logoBuffer = Buffer.from(res.data, "binary");
  } catch (_) {
    /* use fallback */
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: true });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    drawHeader(doc, user, logoBuffer);

    let y = drawUser(doc, user, profile);
    y = drawStatCards(doc, summary, y);
    y = ensureSpace(doc, y, 120);
    y = drawLineChart(doc, weeklyData, y);
    y = ensureSpace(doc, y, 120);
    y = drawBarChart(doc, weeklyData, y);
    y = ensureSpace(doc, y, 100);
    y = drawWeeklyTable(doc, weeklyData, y);
    y = ensureSpace(doc, y, 100);
    y = drawWorkoutHistory(doc, sessions, y);

    drawFooter(doc);
    doc.end();
  });
};

module.exports = generateFitnessPdf;
