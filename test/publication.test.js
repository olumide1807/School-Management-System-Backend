// Publishing a class's results (POST /result/publish). The read side is
// scoped, so a publication naming another school's term or session — or
// an id that doesn't exist — would sit in the database unnoticed, matching
// nothing. Every id must belong to the school.
const M = require("../models");
const { publishResults } = require("../controller/result");
const { useTestDatabase } = require("./helpers/db");
const { run, asSchool } = require("./helpers/http");
const { recordQueries, unscopedQueries } = require("./helpers/queryLog");
const { reportFixture } = require("./helpers/reportFixture");
const f = require("./helpers/factories");

useTestDatabase();

const publish = (fx, o = {}) =>
    run(publishResults, {
        ...asSchool(fx.school),
        body: { classArmId: String(fx.arm._id), termId: String(fx.term._id), sessionId: String(fx.sess._id), ...o },
    });

describe("publication is scoped to the school", () => {
    test("another school's term gets the same 404 as one that doesn't exist; nothing published", async () => {
        const fx = await reportFixture();
        const other = f.id();
        const otherTerm = await f.term(other, (await f.session(other))._id);
        const foreign = await publish(fx, { termId: String(otherTerm._id) });
        expect(foreign).toEqual({ status: 404, body: { success: false, error: "Term not found!" } });
        expect(await publish(fx, { termId: String(f.id()) })).toEqual(foreign);
        expect(await M.resultPublicationModel.countDocuments()).toBe(0);
    });

    test("another school's session gets the same 404 as one that doesn't exist; nothing published", async () => {
        const fx = await reportFixture();
        const foreign = await publish(fx, { sessionId: String((await f.session(f.id()))._id) });
        expect(foreign).toEqual({ status: 404, body: { success: false, error: "Session not found!" } });
        expect(await publish(fx, { sessionId: String(f.id()) })).toEqual(foreign);
        expect(await M.resultPublicationModel.countDocuments()).toBe(0);
    });

    test("this school's class, term and session: published", async () => {
        const fx = await reportFixture();
        await fx.enterScores("Maths", { Ada: { CA: 30, Exam: 50 } });
        expect((await publish(fx)).status).toBe(201);
        expect(await M.resultPublicationModel.countDocuments({ schoolId: fx.school, term: fx.term._id })).toBe(1);
    });

    test("every lookup it makes is filtered by this school", async () => {
        const fx = await reportFixture();
        await fx.enterScores("Maths", { Ada: { CA: 30, Exam: 50 } });
        let r;
        const calls = await recordQueries(
            [M.classArmModel, M.termModel, M.sessionModel, M.resultPublicationModel],
            async () => { r = await publish(fx); },
        );
        expect(r.status).toBe(201);
        expect(calls.length).toBeGreaterThanOrEqual(4);
        expect(unscopedQueries(calls, fx.school)).toEqual([]);
    });
});
