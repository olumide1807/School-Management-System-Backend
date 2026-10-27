// A class with everything a report card needs: an assessment format, grade
// bands, subjects taught in the class, students, scores and register
// records. Scores go in through the real score-entry endpoint
// (POST /result/batch → batchUpsertResults), so snapshots and totals are
// stored exactly the way production stores them.
//
//   const fx = await reportFixture({ students: ["Ada", "Bola"], subjects: ["Maths"] });
//   await fx.enterScores("Maths", { Ada: { CA: 30, Exam: 50 }, Bola: { CA: 20, Exam: 40 } });
//   await fx.attendance("Ada", [["2026-09-14", "present"], ["2026-09-15", "absent", { autoMarked: true }]]);
//   const report = await fx.build();
//   fx.reportFor(report, "Ada").summary.position
const M = require("../../models");
const { buildClassReport } = require("../../utils/buildClassReport");
const { batchUpsertResults } = require("../../controller/result");
const { run, asSchool } = require("./http");
const f = require("./factories");

const DEFAULT_FORMAT = [
    { name: "CA", maxScore: 40, order: 1 },
    { name: "Exam", maxScore: 60, order: 2 },
];

// A typical Nigerian secondary-school scale
const DEFAULT_BANDS = [
    { grade: "A", remark: "Excellent", from: 70, to: 100 },
    { grade: "B", remark: "Very good", from: 60, to: 69 },
    { grade: "C", remark: "Credit", from: 50, to: 59 },
    { grade: "D", remark: "Pass", from: 45, to: 49 },
    { grade: "E", remark: "Weak pass", from: 40, to: 44 },
    { grade: "F", remark: "Fail", from: 0, to: 39 },
];

async function reportFixture({
    format = DEFAULT_FORMAT,
    bands = DEFAULT_BANDS,
    subjects = ["Maths"],
    students = ["Ada"],
    settings = true,
} = {}) {
    const school = f.id();
    const arm = await f.classArm(school, "JSS1", "a");
    const sess = await f.session(school);
    const term = await f.term(school, sess._id);

    const formatDoc = await M.assessmentModel.create({ schoolId: school, classLevel: arm.classLevelId, assessments: format });
    if (bands) {
        await M.gradeModel.create({
            schoolId: school, name: "Default",
            grades: bands.map((b) => ({ grade: b.grade, remark: b.remark, scoreRange: { from: b.from, to: b.to } })),
        });
    }
    // The model's defaults include the banded report comments
    if (settings) await M.schoolSettingsModel.create({ schoolId: school });

    const subjectIds = {};
    for (const name of subjects) {
        const subject = await M.SubjectModel.create({ schoolId: school, subjectName: name });
        await M.specificSubjectModel.create({ schoolId: school, classArmId: arm._id, subjectId: subject._id });
        subjectIds[name] = subject._id;
    }

    const studentIds = {};
    for (const name of students) {
        studentIds[name] = (await f.student(school, arm._id, { firstName: name }))._id;
    }

    const fx = {
        school, arm, sess, term, subjectIds, studentIds,

        // { Ada: { CA: 30, Exam: 50 }, ... } for one subject, via the real endpoint
        async enterScores(subject, byStudent, { termId = term._id } = {}) {
            const r = await run(batchUpsertResults, {
                ...asSchool(school),
                body: {
                    classArmId: String(arm._id), subjectId: String(subjectIds[subject]),
                    termId: String(termId), sessionId: String(sess._id),
                    entries: Object.entries(byStudent).map(([name, scores]) => ({
                        studentId: String(studentIds[name]),
                        scores: Object.entries(scores).map(([n, score]) => ({ name: n, score })),
                    })),
                },
            });
            if (r.status !== 200 && r.status !== 201) throw new Error(`entering scores failed: ${r.status} ${JSON.stringify(r.body)}`);
            return r;
        },

        // Replaces the class level's assessment format (a school changing it)
        async setFormat(assessments) {
            await M.assessmentModel.updateOne({ _id: formatDoc._id }, { $set: { assessments } });
        },

        async addTerm(o) {
            return f.term(school, sess._id, { currentTerm: false, ...o });
        },

        // [[ "2026-09-14", "present" ], [ "2026-09-15", "absent", { autoMarked: true } ], ...]
        async attendance(name, days, { termId = term._id } = {}) {
            await M.studentAttendanceModel.insertMany(days.map(([date, status, o = {}]) => ({
                schoolId: school, studentId: studentIds[name], classArmId: arm._id,
                sessionId: sess._id, termId, date: f.D(date), status,
                ...(o.autoMarked ? { autoMarked: true } : { recordedBy: f.id() }),
                ...o,
            })));
        },

        build({ termId = term._id, schoolId = school, classArmId = arm._id } = {}) {
            return buildClassReport(schoolId, classArmId, termId, sess._id);
        },

        reportFor(report, name) {
            return report.reports.find((r) => String(r.student._id) === String(studentIds[name]));
        },

        subjectFor(report, name, subject) {
            return fx.reportFor(report, name).subjects.find((s) => s.subjectName === subject);
        },
    };
    return fx;
}

// `n` school days from 14 Sep 2026 (a Monday), weekdays only
const schoolDays = (n, start = "2026-09-14") => {
    const out = [];
    const d = new Date(`${start}T00:00:00Z`);
    while (out.length < n) {
        if (![0, 6].includes(d.getUTCDay())) out.push(d.toISOString().slice(0, 10));
        d.setUTCDate(d.getUTCDate() + 1);
    }
    return out;
};

module.exports = { reportFixture, schoolDays, DEFAULT_FORMAT, DEFAULT_BANDS };
