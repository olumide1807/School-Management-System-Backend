// A term and session that arrive together must match: the term must be
// part of the session. Results are filed per session, so scores for a term
// filed under the wrong session are stored where nothing reads them —
// invisible rather than lost, and the report just shows nothing.
//
// Every place a term and session arrive together goes through
// resolveTermInSession (utils/termSession.js).
const M = require("../models");
const R = require("../controller/result");
const { buildClassReport } = require("../utils/buildClassReport");
const { useTestDatabase } = require("./helpers/db");
const { run, asSchool } = require("./helpers/http");
const { reportFixture } = require("./helpers/reportFixture");
const f = require("./helpers/factories");

useTestDatabase();

// A school with last session's Third Term alongside this session's First Term
async function world() {
    const fx = await reportFixture();
    const lastSession = await f.session(fx.school, { sessionName: "2025/2026", currentSession: false });
    const lastTerm = await f.term(fx.school, lastSession._id, { termName: "Third Term", currentTerm: false });
    return { fx, lastSession, lastTerm };
}
const MISMATCH = "Third Term belongs to 2025/2026, not 2026/2027. Choose a term from the same session.";
const as = (fx) => asSchool(fx.school);
const ids = (fx, termId) => ({ classArmId: String(fx.arm._id), termId: String(termId), sessionId: String(fx.sess._id) });

describe("a term from another session is refused, saying which session it belongs to", () => {
    test("score entry: 400, nothing stored", async () => {
        const { fx, lastTerm } = await world();
        const r = await run(R.batchUpsertResults, {
            ...as(fx),
            body: { ...ids(fx, lastTerm._id), subjectId: String(fx.subjectIds.Maths), entries: [{ studentId: String(fx.studentIds.Ada), scores: [{ name: "CA", score: 30 }] }] },
        });
        expect(r).toEqual({ status: 400, body: { success: false, error: MISMATCH } });
        expect(await M.resultModel.countDocuments()).toBe(0);
    });

    test("comments: 400, nothing stored", async () => {
        const { fx, lastTerm } = await world();
        const r = await run(R.upsertComments, {
            ...as(fx), body: { studentId: String(fx.studentIds.Ada), termId: String(lastTerm._id), sessionId: String(fx.sess._id), teacherComment: "Good" },
        });
        expect(r).toEqual({ status: 400, body: { success: false, error: MISMATCH } });
        expect(await M.resultModel.countDocuments()).toBe(0);
    });

    test("publication: 400, nothing published", async () => {
        const { fx, lastTerm } = await world();
        const r = await run(R.publishResults, { ...as(fx), body: ids(fx, lastTerm._id) });
        expect(r).toEqual({ status: 400, body: { success: false, error: MISMATCH } });
        expect(await M.resultPublicationModel.countDocuments()).toBe(0);
    });

    test("reading a class's scores for a subject: 400 rather than an empty sheet", async () => {
        const { fx, lastTerm } = await world();
        const r = await run(R.getClassSubjectResults, {
            ...as(fx), params: { classArmId: String(fx.arm._id), subjectId: String(fx.subjectIds.Maths) }, query: { termId: String(lastTerm._id), sessionId: String(fx.sess._id) },
        });
        expect(r).toEqual({ status: 400, body: { success: false, error: MISMATCH } });
    });

    test("the class report: 400 rather than a report with nothing in it", async () => {
        const { fx, lastTerm } = await world();
        const r = await run(R.getClassReport, {
            ...as(fx), params: { classArmId: String(fx.arm._id) }, query: { termId: String(lastTerm._id), sessionId: String(fx.sess._id) },
        });
        expect(r).toEqual({ status: 400, body: { success: false, error: MISMATCH } });
    });

    test("buildClassReport itself builds nothing from a mismatched pair", async () => {
        const { fx, lastTerm } = await world();
        expect(await buildClassReport(fx.school, fx.arm._id, lastTerm._id, fx.sess._id)).toBeNull();
    });

    test("a term whose session no longer exists says so", async () => {
        const { fx } = await world();
        const stray = await f.term(fx.school, f.id(), { termName: "Stray Term", currentTerm: false });
        const r = await run(R.publishResults, { ...as(fx), body: ids(fx, stray._id) });
        expect(r.status).toBe(400);
        expect(r.body.error).toBe("Stray Term isn't part of any session, not 2026/2027. Choose a term from the same session.");
    });
});

test("a matching term and session still work everywhere", async () => {
    const { fx } = await world();
    await fx.enterScores("Maths", { Ada: { CA: 30, Exam: 50 } });
    expect((await run(R.upsertComments, { ...as(fx), body: { studentId: String(fx.studentIds.Ada), termId: String(fx.term._id), sessionId: String(fx.sess._id), teacherComment: "Good" } })).status).toBe(200);
    expect((await run(R.publishResults, { ...as(fx), body: ids(fx, fx.term._id) })).status).toBe(201);
    const report = await run(R.getClassReport, { ...as(fx), params: { classArmId: String(fx.arm._id) }, query: { termId: String(fx.term._id), sessionId: String(fx.sess._id) } });
    expect(report.status).toBe(200);
    expect(fx.subjectFor(report.body.data, "Ada", "Maths").Total).toBe(80);
});
