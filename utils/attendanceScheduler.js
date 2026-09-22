const {
  termModel,
  classArmModel,
  studentModel,
  studentAttendanceModel,
} = require("../models");
const periodSettingsModel = require("../models/periodSettings");
const { isSchoolDay, toDayStart } = require("./schoolDay");

/**
 * Attendance Auto-Mark Scheduler
 *
 * After school closes, any class whose register was never taken gets
 * absent records created for every student, flagged `autoMarked: true`.
 *
 * Those records are deliberately distinguishable from a teacher's own
 * marks: they show on the register and on reports, but they are excluded
 * from attendance SCORES, because a missed register is the school's
 * omission and shouldn't cost a child marks.
 *
 * A form teacher can correct them for the rest of the day, under the
 * existing same-day rule in markClassAttendance. After midnight only a
 * super admin can change them.
 *
 * Runs every 30 minutes. Idempotent — a class that already has records
 * for today is skipped, so repeated runs do nothing.
 *
 * NOTE ON TIME: close time is compared against the server's local clock.
 * The server should run in Africa/Lagos (or have TZ set accordingly),
 * otherwise marking will fire at the wrong hour.
 */

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
};

async function processSchool(schoolId, now) {
  // 1. Must be inside a term
  const activeTerm = await termModel.findOne({ schoolId, currentTerm: true });
  if (!activeTerm) return;

  // 2. Must be a school day
  const { open, reason, closure } = await isSchoolDay(schoolId, now);
  if (!open) {
    console.log(
      `[AutoMark] School ${schoolId}: skipped (${reason}${closure ? ` — ${closure.name}` : ""})`
    );
    return;
  }

  // 3. School must have closed for the day
  const settings = await periodSettingsModel.findOne({ schoolId });
  if (!settings?.endTime) {
    console.log(`[AutoMark] School ${schoolId}: no school hours set, skipped`);
    return;
  }

  const closeMinutes = toMinutes(settings.endTime);
  if (closeMinutes === null) return;

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  if (nowMinutes < closeMinutes) return;

  // 4. Any class with no register today
  const day = toDayStart(now);
  const arms = await classArmModel.find({ schoolId });

  for (const arm of arms) {
    const existing = await studentAttendanceModel.countDocuments({
      schoolId,
      classArmId: arm._id,
      date: day,
    });
    if (existing > 0) continue;

    const students = await studentModel.find({ schoolId, classArmId: arm._id });
    if (students.length === 0) continue;

    await studentAttendanceModel.insertMany(
      students.map((s) => ({
        schoolId,
        studentId: s._id,
        classArmId: arm._id,
        termId: activeTerm._id,
        sessionId: activeTerm.sessionId,
        date: day,
        status: "absent",
        autoMarked: true,
      }))
    );

    console.log(
      `[AutoMark] School ${schoolId}: marked ${students.length} student${students.length === 1 ? "" : "s"} absent in arm ${arm._id} (register not taken)`
    );
  }
}

async function runAutoMark() {
  const now = new Date();
  try {
    const terms = await termModel.find({ currentTerm: true });
    const schoolIds = [...new Set(terms.map((t) => String(t.schoolId)))];

    for (const schoolId of schoolIds) {
      try {
        await processSchool(schoolId, now);
      } catch (e) {
        console.error(`[AutoMark] Error processing school ${schoolId}:`, e);
      }
    }
  } catch (e) {
    console.error("[AutoMark] Error running auto-mark:", e);
  }
}

function startAttendanceScheduler() {
  const THIRTY_MINUTES = 30 * 60 * 1000;

  console.log("[AutoMark] Attendance auto-mark scheduler started (runs every 30 minutes)");

  setTimeout(runAutoMark, 10000);
  setInterval(runAutoMark, THIRTY_MINUTES);
}

module.exports = { startAttendanceScheduler, runAutoMark };
