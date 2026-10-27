// autoMarked means "nobody took the register; the scheduler filled this
// day in as absent". Once a person records the day — by taking the
// register, or editing the record — it isn't that any more, and the flag
// has to go. Left set, the day is counted present but excluded from the
// days total (11 out of 10 in the attendance score), and the portal shows a
// register that was taken as "not marked".
//
// (The older /student/attendance create and edit routes can't save a
// record at all — they validate status as a boolean against a model that
// requires "present" or "absent" — so they can't fill a flagged day.)
const M = require("../models");
const attendance = require("../controller/attendance");
const { useTestDatabase } = require("./helpers/db");
const { run, asSchool } = require("./helpers/http");
const { reportFixture, schoolDays } = require("./helpers/reportFixture");

useTestDatabase();

const ATTENDANCE_FORMAT = [
    { name: "CA", maxScore: 30, order: 1 },
    { name: "Exam", maxScore: 60, order: 2 },
    { name: "Attendance", maxScore: 10, order: 3, source: "attendance" },
];

// A class with 10 recorded days and one more the auto-marker filled in
async function world() {
    const fx = await reportFixture({ format: ATTENDANCE_FORMAT, students: ["Ada"] });
    const days = schoolDays(11);
    await fx.attendance("Ada", days.slice(0, 10).map((d) => [d, "present"]));
    await fx.attendance("Ada", [[days[10], "absent", { autoMarked: true }]]);
    const flagged = await M.studentAttendanceModel.findOne({ autoMarked: true });
    return { fx, day: days[10], flagged };
}

describe("a person recording an auto-marked day clears the flag", () => {
    test("taking the register (POST /attendance/class)", async () => {
        const { fx, day, flagged } = await world();
        const r = await run(attendance.markClassAttendance, {
            ...asSchool(fx.school),
            body: { classArmId: String(fx.arm._id), date: day, records: [{ studentId: String(fx.studentIds.Ada), status: "present" }] },
        });
        expect(r.status).toBe(200);
        const after = await M.studentAttendanceModel.findById(flagged._id);
        expect(after).toMatchObject({ status: "present", autoMarked: false });
        expect(after.recordedBy).toBeTruthy();
    });

    test("editing the record (PUT /attendance/:id)", async () => {
        const { fx, flagged } = await world();
        const r = await run(attendance.updateAttendanceRecord, { ...asSchool(fx.school), params: { id: String(flagged._id) }, body: { status: "present" } });
        expect(r.status).toBe(200);
        expect(await M.studentAttendanceModel.findById(flagged._id)).toMatchObject({ status: "present", autoMarked: false });
    });

    test("the score then counts the day: 11 present of 11, so 10 out of 10", async () => {
        const { fx, day } = await world();
        await fx.enterScores("Maths", { Ada: { CA: 20, Exam: 50 } });
        await run(attendance.markClassAttendance, {
            ...asSchool(fx.school),
            body: { classArmId: String(fx.arm._id), date: day, records: [{ studentId: String(fx.studentIds.Ada), status: "present" }] },
        });
        const report = await fx.build();
        expect(fx.reportFor(report, "Ada").attendance).toMatchObject({ present: 11, total: 11, autoMarked: 0, mark: 10 });
    });
});

test("days nobody recorded stay flagged", async () => {
    const { flagged } = await world();
    expect((await M.studentAttendanceModel.findById(flagged._id)).autoMarked).toBe(true);
});
