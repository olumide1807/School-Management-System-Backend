const { asyncHandler } = require("../middleware");
const ErrorResponse = require("../utils/errorResponse");
const { successResponse } = require("../utils/successResponse");
const {
    resultModel,
    studentModel,
    classArmModel,
    assessmentModel,
    specificSubjectModel,
    studentAttendanceModel,
    schoolSettingsModel,
    staffModel,
    resultPublicationModel,
} = require("../models");
const { isValidMongoId } = require("../utils/isValidMongoObjectId");
const gradeModel = require("../models/grade");
const { buildClassReport } = require("../utils/buildClassReport");

const { roundScore, hasScorePrecision } = require("../utils/scorePrecision");
const { resolveTermInSession } = require("../utils/termSession");

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

        // --- Term and session: this school's, and the term part of the session ---
        // Otherwise scores are stored where no report will ever read them
        const termCheck = await resolveTermInSession(schoolId, termId, sessionId);
        if (termCheck.error) return next(termCheck.error);

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
                // A report card shows marks to one decimal (utils/scorePrecision.js)
                if (!hasScorePrecision(value)) {
                    return next(new ErrorResponse(
                        `${s.name} can have at most one decimal place (e.g. 12.5)`, 400
                    ));
                }
                scores.push({ name: s.name, maxScore, score: value });
            }

            prepared.push({
                studentId: entry.studentId,
                scores,
                total: roundScore(scores.reduce((sum, s) => sum + s.score, 0)),
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

        // The format these scores are entered under, attendance component
        // and all, saved with them (see models/result.js)
        const formatSnapshot = [...format.assessments]
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .map((d) => ({ name: d.name, maxScore: d.maxScore, order: d.order || 0, source: d.source || "manual" }));

        for (const p of prepared) {
            const subjectEntry = {
                subject: subjectId,
                specificSubject: specific._id,
                scores: p.scores,
                format: formatSnapshot,
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

        // A mismatched pair would just return nothing; say why instead
        const termCheck = await resolveTermInSession(schoolId, termId, sessionId);
        if (termCheck.error) return next(termCheck.error);

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
        if (!classArm) return next(new ErrorResponse("Class not found!", 404));
 
        const specifics = await specificSubjectModel.find({ classArmId, schoolId });
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
 
        // Same answer as score entry for a term or session that isn't this
        // school's, or a term from another session
        const termCheck = await resolveTermInSession(schoolId, termId, sessionId);
        if (termCheck.error) return next(termCheck.error);

        const report = await buildClassReport(schoolId, classArmId, termId, sessionId);
        if (!report) return next(new ErrorResponse("Term or session not found!", 404));
 
        successResponse(res, 200, null, report);
    } catch (e) {
        console.error("Error building class report:", e);
        next(e);
    }
});

// ============================================================
// SET A REPORT CARD COMMENT
// PUT /result/comments
// { studentId, termId, sessionId, teacherComment?, principalComment? }
//
// The form teacher writes the teacher's comment; the designated
// principal writes the principal's. An empty string clears an
// override and falls back to the banded default.
// ============================================================
exports.upsertComments = asyncHandler(async (req, res, next) => {
    try {
        const schoolId = getSchoolId(req);
        const { studentId, termId, sessionId, teacherComment, principalComment } = req.body;

        for (const [label, value] of [
            ["student", studentId],
            ["term", termId],
            ["session", sessionId],
        ]) {
            if (!isValidMongoId(value)) {
                return next(new ErrorResponse(`Invalid ${label} provided!`, 400));
            }
        }

        const student = await studentModel.findOne({ _id: studentId, schoolId });
        if (!student) return next(new ErrorResponse("Student not found", 404));

        // This school's term and session, the term part of the session: a
        // comment can create the result document, so it mustn't file one
        // under another school's term or a session nothing reads it from
        const termCheck = await resolveTermInSession(schoolId, termId, sessionId);
        if (termCheck.error) return next(termCheck.error);

        const classArm = await classArmModel.findOne({ _id: student.classArmId, schoolId });
        const isFormTeacher =
            String(classArm?.assignedTeacher || "") === String(req.user.id);

        const settings = await schoolSettingsModel.findOne({ schoolId });
        const isPrincipal = String(settings?.principalId || "") === String(req.user.id);

        if (teacherComment !== undefined && !isAdminRole(req) && !isFormTeacher) {
            return next(new ErrorResponse(
                "Only the form teacher can write the teacher's comment", 403
            ));
        }
        if (principalComment !== undefined && !isPrincipal && !req.user.schoolName) {
            return next(new ErrorResponse(
                "Only the principal can write the principal's comment", 403
            ));
        }

        let doc = await resultModel.findOne({
            school: schoolId, student: studentId, session: sessionId,
        });

        if (!doc) {
            doc = await resultModel.create({
                school: schoolId,
                student: studentId,
                session: sessionId,
                classLevel: classArm.classLevelId,
                classArm: classArm._id,
                Terms: [{ termId, subjects: [] }],
            });
        }

        let termBlock = doc.Terms.find((t) => String(t.termId) === String(termId));
        if (!termBlock) {
            doc.Terms.push({ termId, subjects: [] });
            termBlock = doc.Terms[doc.Terms.length - 1];
        }

        if (teacherComment !== undefined) termBlock.teacherComment = teacherComment;
        if (principalComment !== undefined) termBlock.principalComment = principalComment;

        await doc.save();
        successResponse(res, 200, "Comment saved", null);
    } catch (e) {
        console.error("Error saving comment:", e);
        next(e);
    }
});

// ============================================================
// APPEND TO controller/result.js
//
// Add resultPublicationModel to the models destructure at the top.
// ============================================================

// What's missing from a class report, by subject: for each student still
// on the roll, the components of the format their scores were entered
// under that have no score, or that the subject has no scores at all.
// [{ subjectId, subjectName, students: [{ studentId, name, studentID, noScores, missing }] }]
const incompleteScores = (report) => {
    const active = report.reports.filter((r) => r.student.status !== "deactivated");
    return report.subjects
        .map(({ subjectId, subjectName }) => ({
            subjectId,
            subjectName,
            students: active
                .map((r) => {
                    const s = r.subjects.find((x) => x.subjectId === subjectId);
                    if (!s || (s.entered && s.missingComponents.length === 0)) return null;
                    return {
                        studentId: r.student._id,
                        name: [r.student.firstName, r.student.otherName, r.student.surName].filter(Boolean).join(" "),
                        studentID: r.student.studentID,
                        noScores: !s.entered,
                        missing: s.entered ? s.missingComponents : [],
                    };
                })
                .filter(Boolean),
            classSize: active.length,
        }))
        .filter((subject) => subject.students.length > 0)
        .map(({ classSize, ...subject }) => ({ ...subject, wholeClass: subject.students.length === classSize }));
};

// One line per subject, students grouped by what they're missing:
// "Maths: Exam missing for Ada Obi and Bola Ade; no scores for Chidi Eze."
const incompleteScoresMessage = (incomplete) => {
    const names = (list) => {
        const shown = list.slice(0, 5).map((st) => st.name);
        const more = list.length - shown.length;
        const all = more > 0 ? [...shown, `${more} more`] : shown;
        return all.length > 1 ? `${all.slice(0, -1).join(", ")} and ${all[all.length - 1]}` : all[0];
    };
    const lines = incomplete.map((subject) => {
        if (subject.wholeClass && subject.students.every((st) => st.noScores)) {
            return `${subject.subjectName}: no scores for anyone in the class.`;
        }
        const groups = new Map();
        subject.students.forEach((st) => {
            const what = st.noScores ? "no scores" : `${st.missing.join(", ")} missing`;
            groups.set(what, [...(groups.get(what) || []), st]);
        });
        const parts = [...groups].map(([what, list]) => `${what} for ${names(list)}`);
        return `${subject.subjectName}: ${parts.join("; ")}.`;
    });
    return [
        "Some scores haven't been entered, so these results would be published from partial marks — totals, grades and positions would count only what's there.",
        ...lines,
        "Enter the missing scores first. If a subject genuinely wasn't taken, you can publish anyway.",
    ].join("\n");
};

// ============================================================
// PUBLISH A CLASS'S RESULTS FOR A TERM
// POST /result/publish
// { classArmId, termId, sessionId }
//
// Until this is done, students and parents see nothing — a report
// card assembled mid-marking would show a position computed from two
// subjects and would shift under them all term.
//
// Publishing an incomplete set is allowed. Schools have real reasons
// to release results before every subject is in, and the response
// reports what was missing so the UI can say so.
// ============================================================
exports.publishResults = asyncHandler(async (req, res, next) => {
    try {
        const schoolId = getSchoolId(req);
        const { classArmId, termId, sessionId } = req.body;

        for (const [label, value] of [
            ["class arm", classArmId],
            ["term", termId],
            ["session", sessionId],
        ]) {
            if (!isValidMongoId(value)) {
                return next(new ErrorResponse(`Invalid ${label} provided!`, 400));
            }
        }

        // Publication is a school decision, not a teacher's
        if (!isAdminRole(req)) {
            return next(new ErrorResponse(
                "Only an administrator can publish results", 403
            ));
        }

        const classArm = await classArmModel.findOne({ _id: classArmId, schoolId });
        if (!classArm) return next(new ErrorResponse("Class not found!", 404));

        // A publication must name this school's term and session, the term
        // part of the session — the read side would never match anything else
        const termCheck = await resolveTermInSession(schoolId, termId, sessionId);
        if (termCheck.error) return next(termCheck.error);

        const existing = await resultPublicationModel.findOne({
            schoolId, classArm: classArmId, term: termId, session: sessionId,
        });

        if (existing) {
            return next(new ErrorResponse(
                "These results are already published", 400
            ));
        }

        // Publishing turns "what's entered so far" into the school's
        // statement about each child, and a subject with components
        // missing is still totalled, graded and ranked on what's there. So
        // refuse while anything is missing, naming it; the admin can go
        // ahead with confirmIncomplete: true (the boolean only) — a school
        // may genuinely have a subject nobody sat.
        if (req.body.confirmIncomplete !== true) {
            const report = await buildClassReport(schoolId, classArmId, termId, sessionId);
            const incomplete = report ? incompleteScores(report) : [];
            if (incomplete.length > 0) {
                return res.status(409).json({
                    success: false,
                    code: "INCOMPLETE_SCORES",
                    error: incompleteScoresMessage(incomplete),
                    incomplete,
                });
            }
        }

        await resultPublicationModel.create({
            schoolId,
            classArm: classArmId,
            term: termId,
            session: sessionId,
            publishedBy: req.user.id,
        });

        successResponse(res, 201, "Results published", null);
    } catch (e) {
        console.error("Error publishing results:", e);
        next(e);
    }
});

// ============================================================
// UNPUBLISH
// DELETE /result/publish
// { classArmId, termId, sessionId }
//
// Mistakes happen, and pulling a result back beats leaving a wrong
// one in front of families.
// ============================================================
exports.unpublishResults = asyncHandler(async (req, res, next) => {
    try {
        const schoolId = getSchoolId(req);
        const { classArmId, termId, sessionId } = req.body;

        for (const [label, value] of [
            ["class arm", classArmId],
            ["term", termId],
            ["session", sessionId],
        ]) {
            if (!isValidMongoId(value)) {
                return next(new ErrorResponse(`Invalid ${label} provided!`, 400));
            }
        }

        if (!isAdminRole(req)) {
            return next(new ErrorResponse(
                "Only an administrator can unpublish results", 403
            ));
        }

        const removed = await resultPublicationModel.findOneAndDelete({
            schoolId, classArm: classArmId, term: termId, session: sessionId,
        });

        if (!removed) {
            return next(new ErrorResponse("These results aren't published", 404));
        }

        successResponse(res, 200, "Results withdrawn", null);
    } catch (e) {
        console.error("Error unpublishing results:", e);
        next(e);
    }
});
