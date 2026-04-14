const { sessionModel, termModel } = require("../models");

/**
 * Session & Term Auto-Activation Scheduler
 *
 * Runs every hour for all schools and does the following:
 *
 * For each school:
 * 1. Find the term where today falls between termStartDate and termEndDate
 *    (termEndDate is treated as END OF DAY)
 *    → activate that term AND its session
 * 2. If no term matches today (holiday), mark all terms inactive
 * 3. Make sure only ONE term is active per session at any time
 * 4. Make sure only ONE session is active per school at any time
 *
 * This is completely date-driven — it doesn't rely on any existing flags.
 */

/**
 * Get start of day (00:00:00) for a date
 */
function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get end of day (23:59:59.999) for a date
 */
function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

async function checkAndUpdateSessionsAndTerms() {
  const now = new Date();
  console.log(`[Scheduler] Running session/term check at ${now.toISOString()}`);

  try {
    const allSessions = await sessionModel.find({});

    if (allSessions.length === 0) {
      console.log("[Scheduler] No sessions found in the database");
      return;
    }

    const schoolIds = [...new Set(allSessions.map((s) => s.schoolId.toString()))];
    console.log(`[Scheduler] Found ${schoolIds.length} school(s) with sessions`);

    for (const schoolId of schoolIds) {
      await processSchool(schoolId, now);
    }
  } catch (error) {
    console.error("[Scheduler] Error running session/term check:", error);
  }
}

async function processSchool(schoolId, now) {
  try {
    const allTerms = await termModel.find({ schoolId });
    console.log(`[Scheduler] School ${schoolId}: found ${allTerms.length} terms`);

    if (allTerms.length === 0) return;

    // Find the term where today falls between termStartDate (start of day)
    // and termEndDate (end of day, inclusive)
    const activeTerm = allTerms.find((t) => {
      if (!t.termStartDate || !t.termEndDate) return false;
      const s = startOfDay(t.termStartDate);
      const e = endOfDay(t.termEndDate);
      return s <= now && now <= e;
    });

    if (activeTerm) {
      console.log(
        `[Scheduler] Found active term by date: "${activeTerm.termName}" (${activeTerm._id})`
      );

      // Deactivate all OTHER terms in the school
      await termModel.updateMany(
        { schoolId, _id: { $ne: activeTerm._id } },
        { currentTerm: false }
      );

      // Activate this term
      if (!activeTerm.currentTerm) {
        activeTerm.currentTerm = true;
        await activeTerm.save();
        console.log(`[Scheduler] ✓ Activated term "${activeTerm.termName}"`);
      } else {
        console.log(`[Scheduler] Term "${activeTerm.termName}" was already active`);
      }

      // Activate the session this term belongs to
      const session = await sessionModel.findById(activeTerm.sessionId);
      if (session) {
        await sessionModel.updateMany(
          { schoolId, _id: { $ne: session._id } },
          { currentSession: false }
        );

        if (!session.currentSession) {
          session.currentSession = true;
          await session.save();
          console.log(`[Scheduler] ✓ Activated session "${session.sessionName}"`);
        } else {
          console.log(`[Scheduler] Session "${session.sessionName}" was already active`);
        }
      }
    } else {
      // No active term — we're on holiday
      console.log(`[Scheduler] No active term for today (school is on holiday)`);

      // Deactivate all terms
      await termModel.updateMany({ schoolId, currentTerm: true }, { currentTerm: false });

      // Find the session whose overall range includes today (between-terms holiday)
      const sessions = await sessionModel.find({ schoolId });

      let bestSessionId = null;

      for (const session of sessions) {
        const sessionTerms = allTerms.filter(
          (t) => t.sessionId.toString() === session._id.toString()
        );
        if (sessionTerms.length === 0) continue;

        const sorted = sessionTerms
          .filter((t) => t.termStartDate && t.termEndDate)
          .sort((a, b) => new Date(a.termStartDate) - new Date(b.termStartDate));

        if (sorted.length === 0) continue;

        const sessionStart = startOfDay(sorted[0].termStartDate);
        const sessionEnd = endOfDay(sorted[sorted.length - 1].termEndDate);

        if (sessionStart <= now && now <= sessionEnd) {
          bestSessionId = session._id;
          break;
        }
      }

      if (bestSessionId) {
        await sessionModel.updateMany(
          { schoolId, _id: { $ne: bestSessionId } },
          { currentSession: false }
        );
        const bestSession = await sessionModel.findById(bestSessionId);
        if (bestSession && !bestSession.currentSession) {
          bestSession.currentSession = true;
          await bestSession.save();
          console.log(
            `[Scheduler] Kept session "${bestSession.sessionName}" active (between-terms holiday)`
          );
        }
      } else {
        await sessionModel.updateMany(
          { schoolId, currentSession: true },
          { currentSession: false }
        );
        console.log(`[Scheduler] Deactivated all sessions (between sessions or no session today)`);
      }
    }
  } catch (error) {
    console.error(`[Scheduler] Error processing school ${schoolId}:`, error);
  }
}

/**
 * Start the scheduler.
 * Runs once on startup (after a 5-second delay) and then every hour.
 */
function startScheduler() {
  const ONE_HOUR = 60 * 60 * 1000;

  console.log("[Scheduler] Session/Term auto-activation scheduler started (runs every hour)");

  setTimeout(() => {
    checkAndUpdateSessionsAndTerms();
  }, 5000);

  setInterval(() => {
    checkAndUpdateSessionsAndTerms();
  }, ONE_HOUR);
}

module.exports = { startScheduler, checkAndUpdateSessionsAndTerms };