// buildClassReport is the shared source for every figure on a report card:
// the staff results page, printed cards and the student/parent portals all
// read it. Each expectation here is what a correct report card says — not
// whatever the code currently produces.
//
// KNOWN BUG tests use test.failing: they assert the correct behaviour and
// pass only while the code still gets it wrong. When a fix lands they start
// failing — turn them into ordinary tests then. Don't "fix" one by changing
// its expectation.
const M = require("../models");
const { useTestDatabase } = require("./helpers/db");
const { reportFixture, schoolDays } = require("./helpers/reportFixture");
const f = require("./helpers/factories");
const { buildClassReport } = require("../utils/buildClassReport");

useTestDatabase();

// Report entries can hold Mongoose subdocuments; compare them as the API sends them
const plain = (x) => JSON.parse(JSON.stringify(x));

const ATTENDANCE_FORMAT = [
    { name: "CA", maxScore: 30, order: 1 },
    { name: "Exam", maxScore: 60, order: 2 },
    { name: "Attendance", maxScore: 10, order: 3, source: "attendance" },
];

describe("positions: competition ranking", () => {
    test("subject positions with a tie go 1, 2, 2, 4 — not 1, 2, 2, 3", async () => {
        const fx = await reportFixture({ students: ["Ada", "Bola", "Chidi", "Dayo"] });
        await fx.enterScores("Maths", {
            Ada: { CA: 35, Exam: 55 }, Bola: { CA: 30, Exam: 50 }, Chidi: { CA: 32, Exam: 48 }, Dayo: { CA: 20, Exam: 50 },
        });
        const report = await fx.build();
        const pos = (n) => fx.subjectFor(report, n, "Maths").position;
        expect([pos("Ada"), pos("Bola"), pos("Chidi"), pos("Dayo")]).toEqual([1, 2, 2, 4]);
    });

    test("a three-way tie: 1, 2, 2, 2, 5", async () => {
        const fx = await reportFixture({ students: ["A", "B", "C", "D", "E"] });
        await fx.enterScores("Maths", {
            A: { CA: 40, Exam: 50 }, B: { CA: 30, Exam: 50 }, C: { CA: 30, Exam: 50 }, D: { CA: 20, Exam: 60 }, E: { CA: 10, Exam: 10 },
        });
        const report = await fx.build();
        expect(["A", "B", "C", "D", "E"].map((n) => fx.subjectFor(report, n, "Maths").position)).toEqual([1, 2, 2, 2, 5]);
    });

    test("class positions tie the same way, out of the students who can be ranked", async () => {
        const fx = await reportFixture({ students: ["Ada", "Bola", "Chidi", "Dayo", "Ebun"], subjects: ["Maths", "English"] });
        await fx.enterScores("Maths", { Ada: { CA: 40, Exam: 50 }, Bola: { CA: 30, Exam: 50 }, Chidi: { CA: 30, Exam: 50 }, Dayo: { CA: 20, Exam: 40 } });
        await fx.enterScores("English", { Ada: { CA: 40, Exam: 50 }, Bola: { CA: 30, Exam: 50 }, Chidi: { CA: 30, Exam: 50 }, Dayo: { CA: 20, Exam: 40 } });
        const report = await fx.build();
        const s = (n) => fx.reportFor(report, n).summary;
        expect([s("Ada").position, s("Bola").position, s("Chidi").position, s("Dayo").position]).toEqual([1, 2, 2, 4]);
        // Ebun has no scores: not ranked, and not counted in "out of"
        expect(s("Ebun").position).toBeNull();
        expect(s("Ada").outOf).toBe(4);
    });

    // Total is a floating-point sum (controller/result.js), so 12.1 + 50.2 is
    // stored as 62.300000000000004: shown on the card, and ranked above 62.3
    test.failing("KNOWN BUG: equal totals made of decimal scores tie (12.1 + 50.2 and 12.3 + 50 are both 62.3)", async () => {
        const fx = await reportFixture({ students: ["Ada", "Bola"] });
        await fx.enterScores("Maths", { Ada: { CA: 12.1, Exam: 50.2 }, Bola: { CA: 12.3, Exam: 50 } });
        const report = await fx.build();
        expect(fx.subjectFor(report, "Ada", "Maths").Total).toBe(62.3);
        expect(fx.subjectFor(report, "Ada", "Maths").position).toBe(1);
        expect(fx.subjectFor(report, "Bola", "Maths").position).toBe(1);
    });
});

describe("totals and averages", () => {
    test("subject total, the student's total and average, and subjects graded of offered", async () => {
        const fx = await reportFixture({ students: ["Ada"], subjects: ["Maths", "English", "Biology"] });
        await fx.enterScores("Maths", { Ada: { CA: 30, Exam: 50 } });
        await fx.enterScores("English", { Ada: { CA: 25, Exam: 46 } });
        const report = await fx.build();
        const ada = fx.reportFor(report, "Ada");
        expect(fx.subjectFor(report, "Ada", "Maths").Total).toBe(80);
        expect(fx.subjectFor(report, "Ada", "English").Total).toBe(71);
        expect(fx.subjectFor(report, "Ada", "Biology")).toMatchObject({ entered: false, Total: null, grade: null, position: null });
        expect(ada.summary).toMatchObject({ totalScore: 151, average: 75.5, subjectsGraded: 2, subjectsOffered: 3 });
    });

    test("subject statistics: highest, lowest, class average to one decimal, count", async () => {
        const fx = await reportFixture({ students: ["Ada", "Bola", "Chidi"] });
        await fx.enterScores("Maths", { Ada: { CA: 30, Exam: 50 }, Bola: { CA: 20, Exam: 41 }, Chidi: { CA: 25, Exam: 40 } });
        const report = await fx.build();
        expect(report.subjects[0].stats).toEqual({ highest: 80, lowest: 61, average: 68.7, count: 3 });
    });
});

describe("attendance-derived scores", () => {
    test("computed from the register: present days over days recorded, scaled to the component", async () => {
        const fx = await reportFixture({ format: ATTENDANCE_FORMAT, students: ["Ada"] });
        await fx.enterScores("Maths", { Ada: { CA: 20, Exam: 50 } });
        const days = schoolDays(10);
        await fx.attendance("Ada", days.map((d, i) => [d, i < 8 ? "present" : "absent"]));
        const report = await fx.build();
        const maths = fx.subjectFor(report, "Ada", "Maths");
        expect(plain(maths.scores)).toContainEqual({ name: "Attendance", maxScore: 10, score: 8 });
        expect(maths.Total).toBe(78);
        expect(fx.reportFor(report, "Ada").attendance.mark).toBe(8);
    });

    test("auto-marked days — registers nobody took — are left out of the score", async () => {
        const fx = await reportFixture({ format: ATTENDANCE_FORMAT, students: ["Ada"] });
        await fx.enterScores("Maths", { Ada: { CA: 20, Exam: 50 } });
        const days = schoolDays(12);
        await fx.attendance("Ada", [
            ...days.slice(0, 8).map((d) => [d, "present"]),
            [days[8], "absent"],
            ...days.slice(9).map((d) => [d, "absent", { autoMarked: true }]),
        ]);
        const report = await fx.build();
        // 8 present of the 9 days a register was taken: 8/9 × 10 = 8.9 → 9, not 8/12 × 10 → 7
        expect(fx.reportFor(report, "Ada").attendance.mark).toBe(9);
    });

    test("a record still flagged auto-marked is left out on both sides, whatever its status", async () => {
        // The register now clears the flag when a person records a day
        // (test/attendanceRegister.test.js). Records written before that
        // can be flagged and "present"; they mustn't score 11 out of 10.
        const fx = await reportFixture({ format: ATTENDANCE_FORMAT, students: ["Ada"] });
        await fx.enterScores("Maths", { Ada: { CA: 20, Exam: 50 } });
        const days = schoolDays(11);
        await fx.attendance("Ada", [
            ...days.slice(0, 10).map((d) => [d, "present"]),
            [days[10], "present", { autoMarked: true }],
        ]);
        const report = await fx.build();
        expect(fx.reportFor(report, "Ada").attendance.mark).toBe(10);
        expect(fx.subjectFor(report, "Ada", "Maths").Total).toBe(80);
    });

    test("no register at all: the subject isn't graded or ranked, and says why", async () => {
        const fx = await reportFixture({ format: ATTENDANCE_FORMAT, students: ["Ada"] });
        await fx.enterScores("Maths", { Ada: { CA: 20, Exam: 50 } });
        const report = await fx.build();
        expect(fx.subjectFor(report, "Ada", "Maths")).toMatchObject({ complete: false, Total: null, grade: null, position: null, remark: "Attendance not recorded" });
        expect(fx.reportFor(report, "Ada").summary.position).toBeNull();
    });

    test("only this term's register counts", async () => {
        const fx = await reportFixture({ format: ATTENDANCE_FORMAT, students: ["Ada"] });
        const lastTerm = await fx.addTerm({ termName: "Third Term" });
        await fx.enterScores("Maths", { Ada: { CA: 20, Exam: 50 } });
        await fx.attendance("Ada", schoolDays(5).map((d) => [d, "present"]));
        await fx.attendance("Ada", schoolDays(5, "2026-05-04").map((d) => [d, "absent"]), { termId: lastTerm._id });
        expect(fx.reportFor(await fx.build(), "Ada").attendance.mark).toBe(10);
    });
});

describe("scores keep the assessment format they were entered under", () => {
    test("renaming and re-weighting components doesn't change a past term's scores or totals", async () => {
        const fx = await reportFixture({ students: ["Ada"] });
        await fx.enterScores("Maths", { Ada: { CA: 35, Exam: 50 } });
        await fx.setFormat([{ name: "Test", maxScore: 30, order: 1 }, { name: "Exam", maxScore: 70, order: 2 }]);
        const maths = fx.subjectFor(await fx.build(), "Ada", "Maths");
        expect(plain(maths.scores)).toEqual([{ name: "CA", maxScore: 40, score: 35 }, { name: "Exam", maxScore: 60, score: 50 }]);
        expect(maths.Total).toBe(85);
        expect(maths.grade).toBe("A");
    });

    test("adding an attendance component later doesn't change a past term's report", async () => {
        const fx = await reportFixture({ students: ["Ada"] });
        await fx.enterScores("Maths", { Ada: { CA: 35, Exam: 50 } });
        await fx.attendance("Ada", schoolDays(10).map((d) => [d, "present"]));
        const before = fx.subjectFor(await fx.build(), "Ada", "Maths");
        expect(before.Total).toBe(85);

        // Next term the school adds attendance to the format
        await fx.setFormat(ATTENDANCE_FORMAT);
        const report = await fx.build();
        const after = fx.subjectFor(report, "Ada", "Maths");
        expect(plain(after.scores)).toEqual(plain(before.scores));
        expect(after).toMatchObject({ complete: true, Total: 85, grade: "A" });
        expect(fx.reportFor(report, "Ada").attendance.mark).toBeNull();
    });

    test("removing the attendance component later doesn't change a past term's report", async () => {
        const fx = await reportFixture({ format: ATTENDANCE_FORMAT, students: ["Ada"] });
        await fx.enterScores("Maths", { Ada: { CA: 20, Exam: 50 } });
        await fx.attendance("Ada", schoolDays(10).map((d, i) => [d, i < 8 ? "present" : "absent"]));
        await fx.setFormat([{ name: "CA", maxScore: 40, order: 1 }, { name: "Exam", maxScore: 60, order: 2 }]);
        const report = await fx.build();
        expect(plain(fx.subjectFor(report, "Ada", "Maths").scores)).toContainEqual({ name: "Attendance", maxScore: 10, score: 8 });
        expect(fx.subjectFor(report, "Ada", "Maths").Total).toBe(78);
        expect(fx.reportFor(report, "Ada").attendance.mark).toBe(8);
    });

    test("re-weighting the attendance component later doesn't re-weight a past term's", async () => {
        const fx = await reportFixture({ format: ATTENDANCE_FORMAT, students: ["Ada"] });
        await fx.enterScores("Maths", { Ada: { CA: 20, Exam: 50 } });
        await fx.attendance("Ada", schoolDays(10).map((d) => [d, "present"]));
        await fx.setFormat([{ name: "CA", maxScore: 20, order: 1 }, { name: "Exam", maxScore: 60, order: 2 }, { name: "Attendance", maxScore: 20, order: 3, source: "attendance" }]);
        expect(fx.subjectFor(await fx.build(), "Ada", "Maths").Total).toBe(80);
    });

    test("a past term's column headings are the format it was assessed under, not today's", async () => {
        const fx = await reportFixture({ format: ATTENDANCE_FORMAT, students: ["Ada"] });
        await fx.enterScores("Maths", { Ada: { CA: 20, Exam: 50 } });
        await fx.setFormat([{ name: "Test", maxScore: 40, order: 1 }, { name: "Exam", maxScore: 60, order: 2 }]);
        const report = await fx.build();
        expect(report.assessments).toEqual([
            { name: "CA", maxScore: 30, source: "manual" },
            { name: "Exam", maxScore: 60, source: "manual" },
            { name: "Attendance", maxScore: 10, source: "attendance" },
        ]);
        // every heading has its score
        const names = plain(fx.subjectFor(report, "Ada", "Maths").scores).map((x) => x.name);
        expect(report.assessments.every((h) => h.name === "Attendance" || names.includes(h.name))).toBe(true);
    });

    test("a term with nothing entered yet is headed by the current format", async () => {
        const fx = await reportFixture({ format: ATTENDANCE_FORMAT, students: ["Ada"] });
        expect((await fx.build()).assessments.map((a) => a.name)).toEqual(["CA", "Exam", "Attendance"]);
    });

    test("entering scores saves the format they were entered under, attendance component included", async () => {
        const fx = await reportFixture({ format: ATTENDANCE_FORMAT, students: ["Ada"] });
        await fx.enterScores("Maths", { Ada: { CA: 20, Exam: 50 } });
        const doc = await M.resultModel.findOne({ student: fx.studentIds.Ada }).lean();
        expect(doc.Terms[0].subjects[0].format).toEqual([
            { name: "CA", maxScore: 30, order: 1, source: "manual" },
            { name: "Exam", maxScore: 60, order: 2, source: "manual" },
            { name: "Attendance", maxScore: 10, order: 3, source: "attendance" },
        ]);
    });

    // Entries saved before snapshots existed carry no format. Nothing records
    // what format they were assessed under, so they're read against the
    // current one — the old behaviour, until the stored data is backfilled.
    test("an entry saved before snapshots existed is read against the current format", async () => {
        const fx = await reportFixture({ students: ["Ada"] });
        await fx.enterScores("Maths", { Ada: { CA: 35, Exam: 50 } });
        await M.resultModel.collection.updateMany({}, { $unset: { "Terms.$[].subjects.$[].format": "" } });
        await fx.setFormat(ATTENDANCE_FORMAT);
        await fx.attendance("Ada", schoolDays(10).map((d) => [d, "present"]));
        const report = await fx.build();
        expect(fx.subjectFor(report, "Ada", "Maths").Total).toBe(95);
        expect(report.assessments.map((a) => a.name)).toEqual(["CA", "Exam", "Attendance"]);
    });
});

describe("grade bands", () => {
    test.each([
        [100, "A"], [70, "A"], [69, "B"], [60, "B"], [59, "C"], [50, "C"], [49, "D"], [45, "D"], [44, "E"], [40, "E"], [39, "F"], [0, "F"],
    ])("a total of %s is %s", async (total, grade) => {
        const fx = await reportFixture({ format: [{ name: "Exam", maxScore: 100, order: 1 }], students: ["Ada"] });
        await fx.enterScores("Maths", { Ada: { Exam: total } });
        expect(fx.subjectFor(await fx.build(), "Ada", "Maths").grade).toBe(grade);
    });

    // A band is the highest one whose lower bound the total reaches, so a
    // decimal total between integer bands (69 < 69.5 < 70) still has one
    test.each([[69.5, "B"], [59.5, "C"], [49.9, "D"], [39.5, "F"], [99.5, "A"]])("a decimal total between bands (%s) gets the band below: %s", async (total, grade) => {
        const fx = await reportFixture({ format: [{ name: "Exam", maxScore: 100, order: 1 }], students: ["Ada"] });
        await fx.enterScores("Maths", { Ada: { Exam: total } });
        expect(fx.subjectFor(await fx.build(), "Ada", "Maths")).toMatchObject({ grade, complete: true });
    });

    test("bands stored in any order give the same grades", async () => {
        const shuffled = [
            { grade: "C", remark: "Credit", from: 50, to: 59 }, { grade: "A", remark: "Excellent", from: 70, to: 100 },
            { grade: "F", remark: "Fail", from: 0, to: 39 }, { grade: "B", remark: "Very good", from: 60, to: 69 },
            { grade: "D", remark: "Pass", from: 40, to: 49 },
        ];
        const fx = await reportFixture({ format: [{ name: "Exam", maxScore: 100, order: 1 }], students: ["A", "B", "C"], bands: shuffled });
        await fx.enterScores("Maths", { A: { Exam: 70 }, B: { Exam: 69.5 }, C: { Exam: 12 } });
        const report = await fx.build();
        expect(["A", "B", "C"].map((n) => fx.subjectFor(report, n, "Maths").grade)).toEqual(["A", "B", "F"]);
    });

    // The default comment bands are 75–100, 60–74, 45–59, 0–44; averages are
    // to one decimal, so every average between them used to get no comment
    test.each([
        [74.5, "A good result. You can do even better.", "A commendable result. Keep working hard."],
        [59.5, "A fair result. More effort is needed.", "An average result. Improvement is expected."],
        [44.5, "A weak result. Please see me.", "A poor result. Parents should see the principal."],
        [75, "An excellent result. Keep it up.", "An outstanding performance. Well done."],
    ])("an average of %s gets the default comments of the band it reaches", async (average, teacher, principal) => {
        const fx = await reportFixture({ format: [{ name: "Exam", maxScore: 100, order: 1 }], students: ["Ada"] });
        await fx.enterScores("Maths", { Ada: { Exam: average } });
        const ada = fx.reportFor(await fx.build(), "Ada");
        expect(ada.summary.average).toBe(average);
        expect(ada.comments).toMatchObject({ teacher, principal, teacherIsOverride: false, principalIsOverride: false });
    });
});

describe("bandFor", () => {
    const { bandFor } = require("../utils/buildClassReport");
    const from = (b) => b.from;
    const bands = [{ g: "A", from: 70 }, { g: "B", from: 60 }, { g: "F", from: 0 }];

    test("the highest lower bound the value reaches", () => {
        expect(bandFor(bands, 69.99, from).g).toBe("B");
        expect(bandFor(bands, 70, from).g).toBe("A");
        expect(bandFor(bands, 0, from).g).toBe("F");
        expect(bandFor(bands, 120, from).g).toBe("A");
    });

    test("overlapping bands: the higher lower bound wins", () => {
        expect(bandFor([{ g: "wide", from: 50 }, { g: "narrow", from: 65 }], 70, from).g).toBe("narrow");
    });

    test("below every band, or no value: no band", () => {
        expect(bandFor([{ g: "C", from: 40 }], 39.9, from)).toBeNull();
        expect(bandFor(bands, null, from)).toBeNull();
        expect(bandFor([], 50, from)).toBeNull();
    });
});

describe("school scoping", () => {
    test("another school's class arm: no report", async () => {
        const fx = await reportFixture();
        expect(await fx.build({ schoolId: f.id() })).toBeNull();
    });

    test("another school's students, scores, register, format and grade bands never reach this school's report", async () => {
        const fx = await reportFixture({ format: ATTENDANCE_FORMAT, students: ["Ada"] });
        await fx.enterScores("Maths", { Ada: { CA: 20, Exam: 50 } });
        await fx.attendance("Ada", schoolDays(10).map((d) => [d, "present"]));

        // Another school's data, pointing at this school's arm, level, term and session ids
        const other = f.id();
        const intruder = await f.student(other, fx.arm._id, { firstName: "Intruder" });
        await M.resultModel.create({
            school: other, student: fx.studentIds.Ada, session: fx.sess._id, classLevel: fx.arm.classLevelId, classArm: fx.arm._id,
            Terms: [{ termId: fx.term._id, subjects: [{ subject: fx.subjectIds.Maths, scores: [{ name: "CA", maxScore: 30, score: 0 }], Total: 0 }] }],
        });
        await M.studentAttendanceModel.insertMany(schoolDays(10, "2026-10-05").map((d) => ({
            schoolId: other, studentId: fx.studentIds.Ada, classArmId: fx.arm._id, sessionId: fx.sess._id, termId: fx.term._id, date: f.D(d), status: "absent", recordedBy: f.id(),
        })));
        await M.assessmentModel.create({ schoolId: other, classLevel: fx.arm.classLevelId, assessments: [{ name: "X", maxScore: 100 }] });
        await M.gradeModel.create({ schoolId: other, grades: [{ grade: "Z", remark: "Other", scoreRange: { from: 0, to: 100 } }] });

        const report = await fx.build();
        expect(report.reports.map((r) => String(r.student._id))).toEqual([String(fx.studentIds.Ada)]);
        expect(JSON.stringify(report)).not.toContain(String(intruder._id));
        const maths = fx.subjectFor(report, "Ada", "Maths");
        expect(maths).toMatchObject({ Total: 80, grade: "A" });
        expect(fx.reportFor(report, "Ada").attendance).toMatchObject({ present: 10, absent: 0, total: 10, mark: 10 });
        expect(report.assessments.map((a) => a.name)).toEqual(["CA", "Exam", "Attendance"]);
    });

    test("another school's term or session: no report", async () => {
        const fx = await reportFixture();
        const other = f.id();
        const otherSession = await f.session(other);
        const otherTerm = await f.term(other, otherSession._id);
        expect(await fx.build({ termId: otherTerm._id })).toBeNull();
        expect(await buildClassReport(fx.school, fx.arm._id, fx.term._id, otherSession._id)).toBeNull();
    });

    // Which document comes back when a filter is missing schoolId depends on
    // the order Mongo returns them, so a test that plants another school's
    // document can pass by luck. Assert the filters instead: every query
    // buildClassReport makes is scoped to this school, and none looks a
    // document up by id alone.
    test("every query it makes is filtered by this school", async () => {
        const fx = await reportFixture({ format: ATTENDANCE_FORMAT, students: ["Ada"] });
        await fx.enterScores("Maths", { Ada: { CA: 20, Exam: 50 } });

        const models = {
            classArm: M.classArmModel, specificSubject: M.specificSubjectModel, term: M.termModel, session: M.sessionModel,
            student: M.studentModel, result: M.resultModel, assessment: M.assessmentModel, grade: M.gradeModel,
            attendance: M.studentAttendanceModel, settings: M.schoolSettingsModel, publication: M.resultPublicationModel, staff: M.staffModel,
        };
        const calls = [];
        const spies = [];
        for (const [name, model] of Object.entries(models)) {
            for (const method of ["find", "findOne", "findById", "countDocuments", "aggregate"]) {
                spies.push(jest.spyOn(model, method).mockImplementation(function (...args) {
                    calls.push({ model: name, method, filter: args[0] });
                    return jest.requireActual("mongoose").Model[method].apply(this, args);
                }));
            }
        }
        try {
            await fx.build();
        } finally {
            spies.forEach((s) => s.mockRestore());
        }

        const school = String(fx.school);
        const scopedTo = (filter) => String(filter?.schoolId ?? filter?.school ?? "");
        expect(calls.length).toBeGreaterThan(5);
        expect(calls.filter((c) => c.method === "findById")).toEqual([]);
        expect(calls.filter((c) => scopedTo(c.filter) !== school).map((c) => `${c.model}.${c.method}`)).toEqual([]);
        // the two that passed by luck before, named explicitly
        expect(calls.some((c) => c.model === "assessment" && scopedTo(c.filter) === school)).toBe(true);
        expect(calls.some((c) => c.model === "grade" && scopedTo(c.filter) === school)).toBe(true);
    });
});
