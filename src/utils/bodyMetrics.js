function calculateMetrics({ weightKg, heightCm, age, gender }) {
  const heightM = heightCm / 100;
  const bmi = parseFloat((weightKg / (heightM * heightM)).toFixed(1));

  let lbm = 0;
  if (gender === "male") {
    lbm = 0.407 * weightKg + 0.267 * heightCm - 19.2;
  } else if (gender === "female") {
    lbm = 0.252 * weightKg + 0.473 * heightCm - 48.3;
  }

  const muscle_mass = parseFloat((lbm * 0.9).toFixed(1));

  let bmi_category = "obese";
  if (bmi < 18.5) {
    bmi_category = "underweight";
  } else if (bmi < 25) {
    bmi_category = "normal";
  } else if (bmi < 30) {
    bmi_category = "overweight";
  }

  return { bmi, muscle_mass, bmi_category };
}

function getWeekNumber(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
  );
}

module.exports = { calculateMetrics, getWeekNumber };
