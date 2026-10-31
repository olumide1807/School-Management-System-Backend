const { termModel, sessionModel } = require("../models");
const { toDayStart } = require("./schoolDay");

// ============================================================
// THE TERM A SCREEN MEANS BY "NOW"
//
// The admin fee screens used to pick this term each in their own code, in
// slightly different orders, so two screens could show two terms' figures
// under the same unlabelled heading. They now ask here, and every answer
// says which term it is and why it was chosen.
//
// In order:
//   active — the term marked current (what families see as "this term")
//   today  — a term whose dates include today (the scheduler hasn't
//            caught up yet)
//   next   — the earliest term that hasn't started (holidays: collecting
//            ahead)
//   last   — the most recently ended term
// A term without dates can only be chosen by being active.
// ============================================================

async function resolveReferenceTerm(schoolId, now = new Date()) {
    const active = await termModel.findOne({ schoolId, currentTerm: true });
    if (active) return { term: active, chosenBy: "active" };

    const today = toDayStart(now).getTime();
    const dated = (await termModel.find({ schoolId }))
        .filter((t) => t.termStartDate && t.termEndDate)
        .map((t) => ({ t, start: toDayStart(t.termStartDate).getTime(), end: toDayStart(t.termEndDate).getTime() }));

    const containing = dated.find((x) => x.start <= today && today <= x.end);
    if (containing) return { term: containing.t, chosenBy: "today" };

    const next = dated.filter((x) => x.start > today).sort((a, b) => a.start - b.start)[0];
    if (next) return { term: next.t, chosenBy: "next" };

    const last = dated.filter((x) => x.end < today).sort((a, b) => b.end - a.end)[0];
    if (last) return { term: last.t, chosenBy: "last" };

    return null;
}

// How a response names the term it used
async function describeTerm(schoolId, term, chosenBy) {
    const session = term.sessionId ? await sessionModel.findOne({ schoolId, _id: term.sessionId }) : null;
    return {
        termId: String(term._id),
        termName: term.termName || "Term",
        sessionName: session?.sessionName || "",
        chosenBy,
    };
}

module.exports = { resolveReferenceTerm, describeTerm };
