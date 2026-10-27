// The parent portal's child endpoints, and results publication.
//
// Guardianship: a parent asking for a child gets that child only if the
// child is in the parent's school AND lists the parent as a guardian.
// Every other answer — another family's child, a child in another school,
// a malformed or unknown id — must be the SAME 404, byte for byte, so a
// parent can't probe which student ids exist.
//
// Publication: results reach families only for terms the school has
// published for that class. An unpublished term isn't listed, and
// requesting it is refused before any report is built.
jest.mock("../utils/buildClassReport", () => ({ buildClassReport: jest.fn() }));

const M = require("../models");
const { buildClassReport } = require("../utils/buildClassReport");
const portal = require("../controller/portal");
const { useTestDatabase } = require("./helpers/db");
const { run, asParent, asStudent } = require("./helpers/http");
const f = require("./helpers/factories");

useTestDatabase();

// A report for the whole class, as buildClassReport returns it
const classReport = (studentIds) => ({
    classArm: { armName: "a" }, formTeacher: null, term: { termName: "First Term" }, session: { sessionName: "2026/2027" },
    assessments: [], subjects: [], gradeBands: [],
    reports: studentIds.map((sid, i) => ({ student: { _id: sid }, summary: { position: i + 1 } })),
});

async function world() {
    const school = f.id(), otherSchool = f.id();
    const parent = f.id(), otherParent = f.id();
    const arm = await f.classArm(school);
    const sess = await f.session(school);
    const term = await f.term(school, sess._id);
    const child = await f.student(school, arm._id, { firstName: "Tobi", guardians: [{ parentId: parent, relationship: "Mother" }] });
    const classmate = await f.student(school, arm._id, { firstName: "Kemi", guardians: [{ parentId: otherParent }] });
    const otherArm = await f.classArm(otherSchool);
    // Lists this parent as a guardian, but belongs to another school
    const elsewhere = await f.student(otherSchool, otherArm._id, { guardians: [{ parentId: parent }] });
    const orphan = await f.student(school, arm._id, { guardians: [] });
    return { school, otherSchool, parent, arm, sess, term, child, classmate, elsewhere, orphan };
}

const CHILD_ENDPOINTS = ["getChildProfile", "getChildResults", "getChildAttendance", "getChildFees"];
const ask = (w, handler, childId, query = {}) =>
    run(portal[handler], { ...asParent(w.parent, w.school), params: { childId: String(childId) }, query });

beforeEach(() => {
    buildClassReport.mockReset();
});

describe("guardianship: every 'no' is the same 404", () => {
    test.each(CHILD_ENDPOINTS)("%s", async (handler) => {
        const w = await world();
        buildClassReport.mockResolvedValue(classReport([w.child._id]));

        const own = await ask(w, handler, w.child._id);
        expect(own.status).toBe(200);

        const refusals = {
            "another family's child": await ask(w, handler, w.classmate._id),
            "a child in another school who lists this parent": await ask(w, handler, w.elsewhere._id),
            "a child with no guardians": await ask(w, handler, w.orphan._id),
            "an id that doesn't exist": await ask(w, handler, f.id()),
            "a malformed id": await ask(w, handler, "not-an-id"),
        };
        for (const [why, r] of Object.entries(refusals)) {
            expect({ why, ...r }).toEqual({ why, status: 404, body: { success: false, error: "Child not found" } });
        }
    });

    test("the profile never includes the other guardians or the password", async () => {
        const w = await world();
        await M.studentModel.updateOne({ _id: w.child._id }, { $push: { guardians: { parentId: f.id(), relationship: "Father" } } });
        const r = await ask(w, "getChildProfile", w.child._id);
        expect(r.status).toBe(200);
        expect(r.body.data.relationship).toBe("Mother");
        expect(r.body.data.child.guardians).toBeUndefined();
        expect(r.body.data.child.password).toBeUndefined();
    });
});

describe("results publication", () => {
    test("nothing published: no terms listed, no report built", async () => {
        const w = await world();
        const r = await ask(w, "getChildResults", w.child._id);
        expect(r).toEqual({ status: 200, body: expect.objectContaining({ data: { available: [], report: null } }) });
        expect(buildClassReport).not.toHaveBeenCalled();
    });

    test("only terms published for the child's class, in this school, are listed", async () => {
        const w = await world();
        const second = await f.term(w.school, w.sess._id, { termName: "Second Term", currentTerm: false });
        const otherArm = await f.classArm(w.school, "JSS2");
        await M.resultPublicationModel.create({ schoolId: w.school, classArm: w.arm._id, term: w.term._id, session: w.sess._id });
        // Published, but for another class, and in another school for this class
        await M.resultPublicationModel.create({ schoolId: w.school, classArm: otherArm._id, term: second._id, session: w.sess._id });
        await M.resultPublicationModel.create({ schoolId: w.otherSchool, classArm: w.arm._id, term: second._id, session: w.sess._id });
        buildClassReport.mockResolvedValue(classReport([w.child._id]));

        const r = await ask(w, "getChildResults", w.child._id);
        expect(r.status).toBe(200);
        expect(r.body.data.available.map((a) => a.termName)).toEqual(["First Term"]);
    });

    test("requesting an unpublished term is refused, and no report is built", async () => {
        const w = await world();
        const second = await f.term(w.school, w.sess._id, { termName: "Second Term", currentTerm: false });
        await M.resultPublicationModel.create({ schoolId: w.school, classArm: w.arm._id, term: w.term._id, session: w.sess._id });

        const r = await ask(w, "getChildResults", w.child._id, { termId: String(second._id), sessionId: String(w.sess._id) });
        expect(r).toEqual({ status: 403, body: { success: false, error: "That result hasn't been released yet" } });
        expect(buildClassReport).not.toHaveBeenCalled();
    });

    test("the student's own endpoint is gated the same way", async () => {
        const w = await world();
        const second = await f.term(w.school, w.sess._id, { termName: "Second Term", currentTerm: false });
        await M.resultPublicationModel.create({ schoolId: w.school, classArm: w.arm._id, term: w.term._id, session: w.sess._id });
        const r = await run(portal.getStudentResults, { ...asStudent(w.child._id), query: { termId: String(second._id), sessionId: String(w.sess._id) } });
        expect(r.status).toBe(403);
        expect(buildClassReport).not.toHaveBeenCalled();
    });

    test("a published term returns this child's report only — not the rest of the class", async () => {
        const w = await world();
        await M.resultPublicationModel.create({ schoolId: w.school, classArm: w.arm._id, term: w.term._id, session: w.sess._id });
        buildClassReport.mockResolvedValue(classReport([w.classmate._id, w.child._id]));

        const r = await ask(w, "getChildResults", w.child._id);
        expect(buildClassReport).toHaveBeenCalledWith(w.school, w.arm._id, String(w.term._id), String(w.sess._id));
        expect(String(r.body.data.report.mine.student._id)).toBe(String(w.child._id));
        expect(r.body.data.report.reports).toBeUndefined();
        expect(JSON.stringify(r.body)).not.toContain(String(w.classmate._id));
    });
});
