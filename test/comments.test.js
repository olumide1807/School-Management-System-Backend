// Report card comments (PUT /result/comments). Saving one can create the
// student's result document, so every id in the request must belong to the
// school — otherwise a comment files a result under another school's term
// or session.
const M = require("../models");
const { upsertComments } = require("../controller/result");
const { useTestDatabase } = require("./helpers/db");
const { run, asSchool } = require("./helpers/http");
const { recordQueries, unscopedQueries } = require("./helpers/queryLog");
const { reportFixture } = require("./helpers/reportFixture");
const f = require("./helpers/factories");

useTestDatabase();

const comment = (fx, o = {}) =>
    run(upsertComments, {
        ...asSchool(fx.school),
        body: { studentId: String(fx.studentIds.Ada), termId: String(fx.term._id), sessionId: String(fx.sess._id), teacherComment: "Good work", ...o },
    });

describe("comments are scoped to the school", () => {
    test("another school's term gets the same 404 as a term that doesn't exist, and nothing is stored", async () => {
        const fx = await reportFixture();
        const other = f.id();
        const otherTerm = await f.term(other, (await f.session(other))._id);
        const foreign = await comment(fx, { termId: String(otherTerm._id) });
        const missing = await comment(fx, { termId: String(f.id()) });
        expect(foreign).toEqual({ status: 404, body: { success: false, error: "Term not found!" } });
        expect(missing).toEqual(foreign);
        expect(await M.resultModel.countDocuments()).toBe(0);
    });

    test("another school's session gets the same 404 as a session that doesn't exist, and nothing is stored", async () => {
        const fx = await reportFixture();
        const foreign = await comment(fx, { sessionId: String((await f.session(f.id()))._id) });
        const missing = await comment(fx, { sessionId: String(f.id()) });
        expect(foreign).toEqual({ status: 404, body: { success: false, error: "Session not found!" } });
        expect(missing).toEqual(foreign);
        expect(await M.resultModel.countDocuments()).toBe(0);
    });

    test("this school's term and session: saved", async () => {
        const fx = await reportFixture();
        expect((await comment(fx)).status).toBe(200);
        const doc = await M.resultModel.findOne({ student: fx.studentIds.Ada }).lean();
        expect(doc.Terms[0].teacherComment).toBe("Good work");
    });

    test("every lookup it makes is filtered by this school", async () => {
        const fx = await reportFixture();
        let r;
        const calls = await recordQueries(
            [M.studentModel, M.termModel, M.sessionModel, M.classArmModel, M.schoolSettingsModel, M.resultModel],
            async () => { r = await comment(fx); },
        );
        expect(r.status).toBe(200);
        expect(calls.length).toBeGreaterThan(4);
        expect(unscopedQueries(calls, fx.school)).toEqual([]);
    });
});
