// Entering scores (POST /result/batch). Every id in the request must
// belong to the school entering the scores — otherwise scores can be
// stored against another school's term or session.
const mongoose = require("mongoose");
const M = require("../models");
const { batchUpsertResults } = require("../controller/result");
const { useTestDatabase } = require("./helpers/db");
const { run, asSchool } = require("./helpers/http");
const { reportFixture } = require("./helpers/reportFixture");
const f = require("./helpers/factories");

useTestDatabase();

const enter = (fx, o = {}) =>
    run(batchUpsertResults, {
        ...asSchool(fx.school),
        body: {
            classArmId: String(fx.arm._id), subjectId: String(fx.subjectIds.Maths),
            termId: String(fx.term._id), sessionId: String(fx.sess._id),
            entries: [{ studentId: String(fx.studentIds.Ada), scores: [{ name: "CA", score: 30 }] }],
            ...o,
        },
    });

describe("score entry is scoped to the school", () => {
    test("another school's term: refused, nothing stored", async () => {
        const fx = await reportFixture();
        const other = f.id();
        const otherTerm = await f.term(other, (await f.session(other))._id);
        const r = await enter(fx, { termId: String(otherTerm._id) });
        expect(r).toEqual({ status: 404, body: { success: false, error: "Term not found!" } });
        expect(await M.resultModel.countDocuments()).toBe(0);
    });

    test("another school's session: refused, nothing stored", async () => {
        const fx = await reportFixture();
        const otherSession = await f.session(f.id());
        const r = await enter(fx, { sessionId: String(otherSession._id) });
        expect(r).toEqual({ status: 404, body: { success: false, error: "Session not found!" } });
        expect(await M.resultModel.countDocuments()).toBe(0);
    });

    test("this school's term and session: stored", async () => {
        const fx = await reportFixture();
        expect((await enter(fx)).status).toBe(200);
        expect(await M.resultModel.countDocuments()).toBe(1);
    });

    // Which document comes back from an unscoped lookup depends on what's
    // in the database; assert the filters instead
    test("every lookup it makes is filtered by this school, and none is by id alone", async () => {
        const fx = await reportFixture();
        const models = [M.classArmModel, M.specificSubjectModel, M.termModel, M.sessionModel, M.assessmentModel, M.studentModel, M.resultModel];
        const calls = [];
        const spies = models.flatMap((model) => ["find", "findOne", "findById"].map((method) =>
            jest.spyOn(model, method).mockImplementation(function (...args) {
                calls.push({ model: model.modelName, method, filter: args[0] });
                return mongoose.Model[method].apply(this, args);
            })));
        try {
            expect((await enter(fx)).status).toBe(200);
        } finally {
            spies.forEach((s) => s.mockRestore());
        }
        const school = String(fx.school);
        const scopedTo = (filter) => String(filter?.schoolId ?? filter?.school ?? "");
        expect(calls.length).toBeGreaterThan(5);
        expect(calls.filter((c) => c.method === "findById").map((c) => c.model)).toEqual([]);
        expect(calls.filter((c) => scopedTo(c.filter) !== school).map((c) => `${c.model}.${c.method}`)).toEqual([]);
    });
});
