const { termModel, sessionModel } = require("../models");
const ErrorResponse = require("./errorResponse");

// A term and session that arrive together in a request: both must belong
// to the school, and the term must be part of that session.
//
// Results are filed per session (one result document per student per
// session) and found by session. Scores entered for a term under a session
// it isn't part of are stored where nothing reads them: not lost, but
// invisible — a teacher enters a full set of marks and the report shows
// nothing. So the pairing is refused on the way in, and explained on the
// way out.
//
// Returns { term, session } or { error } (an ErrorResponse to pass to
// next). Another school's term or session gets the same 404 as one that
// doesn't exist.
async function resolveTermInSession(schoolId, termId, sessionId) {
    const [term, session] = await Promise.all([
        termModel.findOne({ _id: termId, schoolId }),
        sessionModel.findOne({ _id: sessionId, schoolId }),
    ]);
    if (!term) return { error: new ErrorResponse("Term not found!", 404) };
    if (!session) return { error: new ErrorResponse("Session not found!", 404) };

    if (String(term.sessionId) !== String(session._id)) {
        const termSession = await sessionModel.findOne({ _id: term.sessionId, schoolId }).select("sessionName");
        const belongsTo = termSession ? ` belongs to ${termSession.sessionName}` : " isn't part of any session";
        return {
            error: new ErrorResponse(
                `${term.termName || "That term"}${belongsTo}, not ${session.sessionName || "the session given"}. Choose a term from the same session.`,
                400
            ),
        };
    }
    return { term, session };
}

module.exports = { resolveTermInSession };
