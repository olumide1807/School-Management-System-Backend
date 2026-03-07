const { sessionModel, termModel } = require("../models");

/**
 * Session & Term Auto-Activation Scheduler
 * 
 * Runs every hour and checks all schools:
 * 
 * 1. TERM TRANSITION: If the current term's end date has passed,
 *    deactivate it and activate the next term (by term name order).
 * 
 * 2. SESSION END: If all 3 terms in the current session have ended
 *    (no more terms to activate), deactivate the session.
 * 
 * 3. SESSION ACTIVATION: If no session is currently active for a school,
 *    check if any session has a Term 1 whose start date has arrived.
 *    If so, activate that session and its Term 1.
 */

const TERM_ORDER = ["Term 1", "Term 2", "Term 3"];

async function checkAndUpdateSessionsAndTerms() {
  const now = new Date();
  console.log(`[Scheduler] Running session/term check at ${now.toISOString()}`);

  try {
    // Get all schools that have sessions
    const allSessions = await sessionModel.find({});
    
    // Group sessions by schoolId
    const schoolIds = [...new Set(allSessions.map(s => s.schoolId.toString()))];

    for (const schoolId of schoolIds) {
      await processSchool(schoolId, now);
    }
  } catch (error) {
    console.error("[Scheduler] Error running session/term check:", error);
  }
}

async function processSchool(schoolId, now) {
  try {
    // Find the current active session for this school
    const currentSession = await sessionModel.findOne({
      schoolId,
      currentSession: true,
    });

    if (currentSession) {
      await handleActiveSession(currentSession, schoolId, now);
    } else {
      // No active session — check if a new one should be activated
      await handleNoActiveSession(schoolId, now);
    }
  } catch (error) {
    console.error(`[Scheduler] Error processing school ${schoolId}:`, error);
  }
}

async function handleActiveSession(currentSession, schoolId, now) {
  // Get all terms for this session, sorted by term name
  const terms = await termModel
    .find({ sessionId: currentSession._id, schoolId })
    .sort({ termName: 1 });

  if (terms.length === 0) return;

  // Find the current active term
  const activeTerm = terms.find(t => t.currentTerm === true);

  if (activeTerm) {
    // Check if the active term's end date has passed
    if (activeTerm.termEndDate && now > new Date(activeTerm.termEndDate)) {
      console.log(`[Scheduler] Term "${activeTerm.termName}" has ended for session "${currentSession.sessionName}"`);

      // Deactivate current term
      activeTerm.currentTerm = false;
      await activeTerm.save();

      // Find the next term in order
      const currentIndex = TERM_ORDER.indexOf(activeTerm.termName);
      const nextTermName = TERM_ORDER[currentIndex + 1];

      if (nextTermName) {
        const nextTerm = terms.find(t => t.termName === nextTermName);
        if (nextTerm) {
          // Check if the next term's start date has arrived
          if (!nextTerm.termStartDate || now >= new Date(nextTerm.termStartDate)) {
            nextTerm.currentTerm = true;
            await nextTerm.save();
            console.log(`[Scheduler] Activated "${nextTerm.termName}" for session "${currentSession.sessionName}"`);
          } else {
            console.log(`[Scheduler] Next term "${nextTerm.termName}" start date hasn't arrived yet (${nextTerm.termStartDate})`);
          }
        }
      } else {
        // No more terms — this was the last term (Term 3)
        // Deactivate the session
        currentSession.currentSession = false;
        await currentSession.save();
        console.log(`[Scheduler] Session "${currentSession.sessionName}" has ended (all terms completed). Deactivated.`);

        // Try to activate the next session
        await handleNoActiveSession(schoolId, now);
      }
    }
  } else {
    // Session is active but no term is active — try to activate the first term whose date has arrived
    for (const termName of TERM_ORDER) {
      const term = terms.find(t => t.termName === termName);
      if (term && term.termStartDate && now >= new Date(term.termStartDate)) {
        // Check the term hasn't already ended
        if (!term.termEndDate || now <= new Date(term.termEndDate)) {
          term.currentTerm = true;
          await term.save();
          console.log(`[Scheduler] Activated "${term.termName}" for session "${currentSession.sessionName}" (no active term found)`);
          break;
        }
      }
    }
  }
}

async function handleNoActiveSession(schoolId, now) {
  // Find all sessions for this school that are not active, sorted by sessionName
  const inactiveSessions = await sessionModel
    .find({ schoolId, currentSession: false })
    .sort({ sessionName: 1 });

  for (const session of inactiveSessions) {
    // Get Term 1 for this session
    const term1 = await termModel.findOne({
      sessionId: session._id,
      schoolId,
      termName: "Term 1",
    });

    if (term1 && term1.termStartDate && now >= new Date(term1.termStartDate)) {
      // Check if Term 1 hasn't already ended (don't activate a session that's fully in the past)
      const allTerms = await termModel.find({ sessionId: session._id, schoolId });
      const lastTerm = allTerms
        .filter(t => t.termEndDate)
        .sort((a, b) => new Date(b.termEndDate) - new Date(a.termEndDate))[0];

      // If the last term's end date is in the future (or no end date set), activate this session
      if (!lastTerm || !lastTerm.termEndDate || now <= new Date(lastTerm.termEndDate)) {
        // Activate the session
        session.currentSession = true;
        await session.save();
        console.log(`[Scheduler] Activated session "${session.sessionName}" — Term 1 start date has arrived.`);

        // Activate Term 1
        term1.currentTerm = true;
        await term1.save();
        console.log(`[Scheduler] Activated "Term 1" for session "${session.sessionName}"`);
        
        break; // Only activate one session
      }
    }
  }
}

/**
 * Start the scheduler
 * Runs every hour (3600000ms)
 * Also runs once immediately on server start
 */
function startScheduler() {
  const ONE_HOUR = 60 * 60 * 1000;

  console.log("[Scheduler] Session/Term auto-activation scheduler started (runs every hour)");

  // Run once on startup (with a small delay to ensure DB is connected)
  setTimeout(() => {
    checkAndUpdateSessionsAndTerms();
  }, 5000);

  // Then run every hour
  setInterval(() => {
    checkAndUpdateSessionsAndTerms();
  }, ONE_HOUR);
}

module.exports = { startScheduler, checkAndUpdateSessionsAndTerms };