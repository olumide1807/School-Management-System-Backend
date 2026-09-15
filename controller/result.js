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
} = require("../models");
const { isValidMongoId } = require("../utils/isValidMongoObjectId");

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

        const definitions = [...format.assessments].sort(
            (a, b) => (a.order || 0) - (b.order || 0)
        );
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