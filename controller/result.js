const { asyncHandler } = require("../middleware");
const ErrorResponse = require("../utils/errorResponse");
const { successResponse } = require("../utils/successResponse");
const {
    resultModel,
    sessionModel,
    studentModel,
    classArmModel,
    termModel,
    assessmentModel,
    specificSubjectModel,
    studentAttendanceModel,
} = require("../models");
const { isValidMongoId } = require("../utils/isValidMongoObjectId");
const gradeModel = require("../models/grade");

const getSchoolId = (req) => (req.user.schoolName ? req.user.id : req.user.schoolId);
const isAdminRole = (req) => req.user.userType === "admin" || !!req.user.schoolName;

// ============================================================
// ENTER SCORES FOR ONE SUBJECT ACROSS A CLASS
// POST /result/batch
// { classArmId, subjectId, termId, sessionId, entries: [{ studentId, scores: [{ name, score }] }] }
// ============================================================
exports.batchUpsertResults = asyncHandler(async (req, res, next) => {
    try {
        const schoolId = getSchoolId(req);
        const { classArmId, subjectId, termId, sessionId, entries } = req.body;


        for (const [label, value] of [
            ["class arm", classArmId],
            ["subject", subjectId],
            ["term", termId],
            ["session", sessionId],
        ]) {
            if (!isValidMongoId(value)) {
                return next(new ErrorResponse(`Invalid ${label} provided!`, 400));
            }
        }

        if (!Array.isArray(entries) || entries.length === 0) {
            return next(new ErrorResponse("No scores submitted!", 400));
        }

        // --- The class arm must belong to this school ---
        const classArm = await classArmModel.findOne({ _id: classArmId, schoolId });
        if (!classArm) {
            return next(new ErrorResponse("Class not found!", 404));
        }

        // --- The subject must actually be taught in this class ---
        const specific = await specificSubjectModel.findOne({
            subjectId,
            classArmId,
            schoolId,
        });
        if (!specific) {
            return next(new ErrorResponse("This subject is not offered in this class!", 404));
        }

        // --- Only the subject teacher or an admin may enter scores ---
        if (!isAdminRole(req) && String(specific.subjectTeacherId) !== String(req.user.id)) {
            return next(new ErrorResponse(
                "Only the subject teacher can enter scores for this subject", 403
            ));
        }

        // --- Term and session must exist ---
        const [term, session] = await Promise.all([
            termModel.findById(termId),
            sessionModel.findById(sessionId),
        ]);
        if (!term) return next(new ErrorResponse("Term not found!", 404));
        if (!session) return next(new ErrorResponse("Session not found!", 404));

        // --- The assessment format for this class level defines valid scores ---
        const format = await assessmentModel.findOne({
            schoolId,
            classLevel: classArm.classLevelId,
        });
        if (!format) {
            return next(new ErrorResponse(
                "No assessment format has been set up for this class level yet", 400
            ));
        }

        const definitions = [...format.assessments]
            .filter((d) => d.source !== "attendance")
            .sort((a, b) => (a.order || 0) - (b.order || 0));
        const attendanceNames = format.assessments
            .filter((d) => d.source === "attendance")
            .map((d) => d.name);
        const byName = {};
        definitions.forEach((d) => { byName[d.name] = d.maxScore; });

        // --- Validate every entry before writing anything ---
        const studentIds = entries.map((e) => e.studentId);
        if (studentIds.some((sid) => !isValidMongoId(sid))) {
            return next(new ErrorResponse("Invalid student id in submission!", 400));
        }

        const students = await studentModel.find({
            _id: { $in: studentIds },
            schoolId,
            classArmId,
        });

        if (students.length !== studentIds.length) {
            return next(new ErrorResponse(
                "One or more students are not in this class", 400
            ));
        }

        const prepared = [];
        for (const entry of entries) {
            if (!Array.isArray(entry.scores)) {
                return next(new ErrorResponse("Each student needs a scores array", 400));
            }

            const scores = [];
            for (const s of entry.scores) {
                const maxScore = byName[s.name];
                if (attendanceNames.includes(s.name)) {
                    return next(new ErrorResponse(
                        `${s.name} is computed from the register and can't be entered`, 400
                    ));
                }
                if (maxScore === undefined) {
                    return next(new ErrorResponse(
                        `"${s.name}" is not part of this class level's assessment format`, 400
                    ));
                }
                const value = Number(s.score);
                if (Number.isNaN(value) || value < 0 || value > maxScore) {
                    return next(new ErrorResponse(
                        `${s.name} must be between 0 and ${maxScore}`, 400
                    ));
                }
                scores.push({ name: s.name, maxScore, score: value });
            }

            prepared.push({
                studentId: entry.studentId,
                scores,
                total: scores.reduce((sum, s) => sum + s.score, 0),
            });
        }

        // --- Write ---
        const existing = await resultModel.find({
            school: schoolId,
            student: { $in: studentIds },
            session: sessionId,
        });

        const existingByStudent = {};
        existing.forEach((r) => { existingByStudent[String(r.student)] = r; });

        let created = 0;
        let updated = 0;

        for (const p of prepared) {
            const subjectEntry = {
                subject: subjectId,
                specificSubject: specific._id,
                scores: p.scores,
                Total: p.total,
                enteredBy: req.user.id,
                enteredAt: new Date(),
            };

            let doc = existingByStudent[String(p.studentId)];

            if (!doc) {
                doc = await resultModel.create({
                    school: schoolId,
                    student: p.studentId,
                    session: sessionId,
                    classLevel: classArm.classLevelId,
                    classArm: classArmId,
                    Terms: [{ termId, subjects: [subjectEntry] }],
                });
                created++;
                continue;
            }

            let termBlock = doc.Terms.find(
                (t) => String(t.termId) === String(termId)
            );

            if (!termBlock) {
                doc.Terms.push({ termId, subjects: [subjectEntry] });
            } else {
                const idx = termBlock.subjects.findIndex(
                    (s) => String(s.subject) === String(subjectId)
                );
                if (idx === -1) termBlock.subjects.push(subjectEntry);
                else termBlock.subjects[idx] = subjectEntry;
            }

            await doc.save();
            updated++;
        }

        successResponse(
            res,
            200,
            `Scores saved for ${created + updated} students`,
            { created, updated }
        );
    } catch (e) {
        console.error("Error saving results:", e);
        next(e);
    }
});

// ============================================================
// SCORES FOR ONE SUBJECT ACROSS A CLASS (to populate the sheet)
// GET /result/class/:classArmId/subject/:subjectId?termId=&sessionId=
// ============================================================
exports.getClassSubjectResults = asyncHandler(async (req, res, next) => {
    try {
        const schoolId = getSchoolId(req);
        const { classArmId, subjectId } = req.params;
        const { termId, sessionId } = req.query;

        for (const [label, value] of [
            ["class arm", classArmId],
            ["subject", subjectId],
            ["term", termId],
            ["session", sessionId],
        ]) {
            if (!isValidMongoId(value)) {
                return next(new ErrorResponse(`Invalid ${label} provided!`, 400));
            }
        }

        const results = await resultModel.find({
            school: schoolId,
            classArm: classArmId,
            session: sessionId,
        });

        // Flatten to one row per student for this term and subject
        const rows = [];
        results.forEach((r) => {
            const termBlock = r.Terms.find((t) => String(t.termId) === String(termId));
            if (!termBlock) return;
            const subjectBlock = termBlock.subjects.find(
                (s) => String(s.subject) === String(subjectId)
            );
            if (!subjectBlock) return;
            rows.push({
                studentId: r.student,
                scores: subjectBlock.scores,
                Total: subjectBlock.Total,
                enteredAt: subjectBlock.enteredAt,
            });
        });

        successResponse(res, 200, null, rows);
    } catch (e) {
        console.error("Error getting class subject results:", e);
        next(e);
    }
});

// ============================================================
// ONE STUDENT'S FULL RESULT
// GET /result/student/:studentId?sessionId=
// ============================================================
exports.getStudentResult = asyncHandler(async (req, res, next) => {
    try {
        const schoolId = getSchoolId(req);
        const { studentId } = req.params;
        const { sessionId } = req.query;

        if (!isValidMongoId(studentId) || !isValidMongoId(sessionId)) {
            return next(new ErrorResponse("Invalid student or session provided!", 400));
        }

        const result = await resultModel
            .findOne({ school: schoolId, student: studentId, session: sessionId })
            .populate("Terms.subjects.subject", "subjectName");

        // No result yet is an empty state, not an error
        successResponse(res, 200, null, result || null);
    } catch (e) {
        console.error("Error getting student result:", e);
        next(e);
    }
});

// ============================================================
// ADD TO THE TOP OF controller/result.js
// ============================================================
//
// 1. Extend the models destructure to include:
//      studentAttendanceModel
//
// 2. Add this require below it (the grade model isn't exported under
//    a name I've confirmed, so it's required directly):
//
//      const gradeModel = require("../models/grade");
//
// ============================================================


// Competition ranking: ties share a position, the next rank skips.
// Two students on 74.5 are both 2nd; the next student is 4th.
const rankBy = (items) => {
    const sorted = [...items].sort((a, b) => b.value - a.value);
    const positions = {};
    sorted.forEach((item, i) => {
        if (i > 0 && item.value === sorted[i - 1].value) {
            positions[item.id] = positions[sorted[i - 1].id];
        } else {
            positions[item.id] = i + 1;
        }
    });
    return positions;
};

const round1 = (n) => Math.round(n * 10) / 10;

// ============================================================
// REPLACES the existing getClassReport in controller/result.js.
// rankBy and round1 stay as they are above it.
// ============================================================

// ============================================================
// FULL CLASS REPORT FOR ONE TERM
// GET /result/report/class/:classArmId?termId=&sessionId=
//
// Positions are computed here rather than stored, because they
// change every time any teacher saves a score for this class.
//
// If the assessment format includes an attendance item, its mark
// is computed here from the register rather than stored, because
// attendance keeps changing until the term ends.
// ============================================================
exports.getClassReport = asyncHandler(async (req, res, next) => {
    try {
        const schoolId = getSchoolId(req);
        const { classArmId } = req.params;
        const { termId, sessionId } = req.query;

        for (const [label, value] of [
            ["class arm", classArmId],
            ["term", termId],
            ["session", sessionId],
        ]) {
            if (!isValidMongoId(value)) {
                return next(new ErrorResponse(`Invalid ${label} provided!`, 400));
            }
        }

        const classArm = await classArmModel.findOne({ _id: classArmId, schoolId });
        if (!classArm) {
            return next(new ErrorResponse("Class not found!", 404));
        }

        const specifics = await specificSubjectModel
            .find({ classArmId, schoolId })
            .populate("subjectId", "subjectName");

        const isFormTeacher =
            String(classArm.assignedTeacher || "") === String(req.user.id);
        const teachesHere = specifics.some(
            (sp) => String(sp.subjectTeacherId || "") === String(req.user.id)
        );
        if (!isAdminRole(req) && !isFormTeacher && !teachesHere) {
            return next(new ErrorResponse(
                "You don't have access to this class's report", 403
            ));
        }

        const [term, session, students, results, format, gradeDoc, attendance] =
            await Promise.all([
                termModel.findById(termId),
                sessionModel.findById(sessionId),
                studentModel
                    .find({ classArmId, schoolId })
                    .select("firstName surName otherName studentID gender profilePicture status"),
                resultModel.find({ school: schoolId, classArm: classArmId, session: sessionId }),
                assessmentModel.findOne({ schoolId, classLevel: classArm.classLevelId }),
                gradeModel.findOne({ schoolId }),
                studentAttendanceModel.find({ schoolId, classArmId, termId }),
            ]);

        if (!term) return next(new ErrorResponse("Term not found!", 404));
        if (!session) return next(new ErrorResponse("Session not found!", 404));

        const bands = gradeDoc?.grades || [];
        const gradeFor = (total) => {
            const band = bands.find(
                (g) => total >= (g.scoreRange?.from ?? 0) && total <= (g.scoreRange?.to ?? 100)
            );
            return band
                ? { grade: band.grade, remark: band.remark, color: band.color }
                : { grade: null, remark: null, color: null };
        };

        const definitions = format
            ? [...format.assessments].sort((a, b) => (a.order || 0) - (b.order || 0))
            : [];
        const attendanceDef = definitions.find((d) => d.source === "attendance") || null;

        const subjectList = specifics.map((sp) => ({
            subjectId: String(sp.subjectId?._id || sp.subjectId),
            subjectName: sp.subjectId?.subjectName || "Subject",
        }));

        // --- Attendance per student ---
        const attendanceByStudent = {};
        attendance.forEach((a) => {
            const sid = String(a.studentId);
            if (!attendanceByStudent[sid]) {
                attendanceByStudent[sid] = { present: 0, absent: 0, total: 0, autoMarked: 0 };
            }
            const rec = attendanceByStudent[sid];
            if (a.status === "present") rec.present++;
            if (a.status === "absent") rec.absent++;
            rec.total++;
            if (a.autoMarked) rec.autoMarked++;
        });

        // Auto-marked days are excluded from the score — a missed register
        // is the school's omission, not the child's
        const attendanceMarkFor = (sid) => {
            if (!attendanceDef) return null;
            const a = attendanceByStudent[sid];
            if (!a) return null;
            const scoredTotal = a.total - a.autoMarked;
            if (scoredTotal === 0) return null;
            return Math.round((a.present / scoredTotal) * attendanceDef.maxScore);
        };

        // --- Index stored (manual) scores: studentId -> subjectId -> entry ---
        const scoreIndex = {};
        results.forEach((r) => {
            const termBlock = r.Terms.find((t) => String(t.termId) === String(termId));
            if (!termBlock) return;
            const sid = String(r.student);
            scoreIndex[sid] = {};
            termBlock.subjects.forEach((s) => {
                scoreIndex[sid][String(s.subject)] = s;
            });
        });

        // --- Effective subject result: manual scores + computed attendance ---
        // complete = manual scores entered AND (no attendance item, or register taken)
        const effective = {};
        students.forEach((st) => {
            const sid = String(st._id);
            const attMark = attendanceMarkFor(sid);
            effective[sid] = {};

            subjectList.forEach(({ subjectId }) => {
                const entry = scoreIndex[sid]?.[subjectId];
                if (!entry) {
                    effective[sid][subjectId] = {
                        entered: false, complete: false, scores: [], total: null,
                    };
                    return;
                }

                const scores = [...entry.scores];
                let total = entry.Total;
                let complete = true;

                if (attendanceDef) {
                    if (attMark === null) {
                        complete = false;
                    } else {
                        scores.push({
                            name: attendanceDef.name,
                            maxScore: attendanceDef.maxScore,
                            score: attMark,
                        });
                        total += attMark;
                    }
                }

                effective[sid][subjectId] = {
                    entered: true,
                    complete,
                    scores,
                    total: complete ? total : null,
                };
            });
        });

        // --- Per-subject stats and positions, over complete totals only ---
        const subjectStats = {};
        const subjectPositions = {};

        subjectList.forEach(({ subjectId }) => {
            const entries = students
                .map((st) => {
                    const e = effective[String(st._id)][subjectId];
                    return e.complete ? { id: String(st._id), value: e.total } : null;
                })
                .filter(Boolean);

            if (entries.length === 0) {
                subjectStats[subjectId] = { highest: null, lowest: null, average: null, count: 0 };
                subjectPositions[subjectId] = {};
                return;
            }

            const values = entries.map((e) => e.value);
            subjectStats[subjectId] = {
                highest: Math.max(...values),
                lowest: Math.min(...values),
                average: round1(values.reduce((a, b) => a + b, 0) / values.length),
                count: values.length,
            };
            subjectPositions[subjectId] = rankBy(entries);
        });

        // --- Build each student's report ---
        const reports = students.map((st) => {
            const sid = String(st._id);
            const attMark = attendanceMarkFor(sid);

            const subjects = subjectList.map(({ subjectId, subjectName }) => {
                const e = effective[sid][subjectId];

                if (!e.entered) {
                    return {
                        subjectId, subjectName,
                        entered: false, complete: false,
                        scores: [], Total: null, grade: null, remark: null, position: null,
                    };
                }

                if (!e.complete) {
                    return {
                        subjectId, subjectName,
                        entered: true, complete: false,
                        scores: e.scores, Total: null, grade: null,
                        remark: "Attendance not recorded", position: null,
                    };
                }

                const g = gradeFor(e.total);
                return {
                    subjectId, subjectName,
                    entered: true, complete: true,
                    scores: e.scores,
                    Total: e.total,
                    grade: g.grade,
                    remark: g.remark,
                    color: g.color,
                    position: subjectPositions[subjectId]?.[sid] ?? null,
                };
            });

            const graded = subjects.filter((s) => s.complete);
            const totalScore = graded.reduce((sum, s) => sum + s.Total, 0);
            const average = graded.length > 0 ? round1(totalScore / graded.length) : null;

            return {
                student: st,
                subjects,
                summary: {
                    totalScore,
                    average,
                    subjectsGraded: graded.length,
                    subjectsOffered: subjectList.length,
                    position: null,
                    outOf: null,
                },
                attendance: {
                    ...(attendanceByStudent[sid] || { present: 0, absent: 0, total: 0 }),
                    mark: attMark,
                },
            };
        });

        // --- Class position by average; students with nothing complete aren't ranked ---
        const rankable = reports
            .filter((r) => r.summary.average !== null)
            .map((r) => ({ id: String(r.student._id), value: r.summary.average }));
        const classPositions = rankBy(rankable);

        reports.forEach((r) => {
            r.summary.position = classPositions[String(r.student._id)] ?? null;
            r.summary.outOf = rankable.length;
        });

        successResponse(res, 200, null, {
            classArm: { _id: classArm._id, armName: classArm.armName, classLevelId: classArm.classLevelId },
            term: { _id: term._id, termName: term.termName },
            session: { _id: session._id, sessionName: session.sessionName },
            assessments: definitions.map((a) => ({
                name: a.name,
                maxScore: a.maxScore,
                source: a.source || "manual",
            })),
            subjects: subjectList.map((s) => ({ ...s, stats: subjectStats[s.subjectId] })),
            gradeBands: bands.map((b) => ({
                grade: b.grade,
                remark: b.remark,
                from: b.scoreRange?.from,
                to: b.scoreRange?.to,
            })),
            reports,
        });
    } catch (e) {
        console.error("Error building class report:", e);
        next(e);
    }
});