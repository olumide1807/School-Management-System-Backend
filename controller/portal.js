const { asyncHandler } = require("../middleware");
const ErrorResponse = require("../utils/errorResponse");
const { successResponse } = require("../utils/successResponse");
const {
    studentModel,
    classArmModel,
    classLevelModel,
    studentAttendanceModel,
    termModel,
    sessionModel,
    announcementModel,
    specificSubjectModel,
    staffModel,
    resultPublicationModel,
    resultModel,
} = require("../models");
const { buildClassReport } = require("../utils/buildClassReport");
const { isValidMongoId } = require("../utils/isValidMongoObjectId");

// ============================================================
// STUDENT PORTAL HOME
// GET /portal/student/me
//
// One call rather than six, because a student's home needs their
// profile, class, attendance and notices together and the portal
// runs on phones over patchy connections.
// ============================================================
exports.getStudentPortalHome = asyncHandler(async (req, res, next) => {
    try {
        const studentId = req.user.id;

        const student = await studentModel
            .findById(studentId)
            .select("-password -resetPasswordToken -resetPasswordExpire");

        if (!student) return next(new ErrorResponse("Student not found", 404));

        const schoolId = student.schoolId;

        const [classArm, activeTerm] = await Promise.all([
            classArmModel.findById(student.classArmId),
            termModel.findOne({ schoolId, currentTerm: true }),
        ]);

        const [classLevel, formTeacher, session] = await Promise.all([
            classArm ? classLevelModel.findById(classArm.classLevelId) : null,
            classArm?.assignedTeacher
                ? staffModel.findById(classArm.assignedTeacher).select("title firstName surname")
                : null,
            activeTerm ? sessionModel.findById(activeTerm.sessionId) : null,
        ]);

        // --- This term's attendance ---
        let attendance = { present: 0, absent: 0, total: 0, percentage: null };
        if (activeTerm && student.classArmId) {
            const records = await studentAttendanceModel.find({
                schoolId,
                studentId,
                termId: activeTerm._id,
            });
            const present = records.filter((r) => r.status === "present").length;
            const absent = records.filter((r) => r.status === "absent").length;
            attendance = {
                present,
                absent,
                total: records.length,
                percentage: records.length
                    ? Math.round((present / records.length) * 100)
                    : null,
            };
        }

        // --- Subjects offered to this class, with who teaches them ---
        let subjects = [];
        if (student.classArmId) {
            const specifics = await specificSubjectModel
                .find({ classArmId: student.classArmId, schoolId })
                .populate("subjectId", "subjectName");

            const teacherIds = specifics
                .map((sp) => sp.subjectTeacherId)
                .filter(Boolean);
            const teachers = await staffModel
                .find({ _id: { $in: teacherIds } })
                .select("title firstName surname");

            subjects = specifics.map((sp) => {
                const t = teachers.find(
                    (x) => String(x._id) === String(sp.subjectTeacherId)
                );
                return {
                    _id: sp._id,
                    subjectName: sp.subjectId?.subjectName || "Subject",
                    teacher: t
                        ? `${t.title ? t.title + " " : ""}${t.firstName || ""} ${t.surname || ""}`.trim()
                        : null,
                };
            });
        }

        // --- Announcements for students, currently running ---
        const today = new Date();
        const announcements = await announcementModel
            .find({
                schoolId,
                visibleTo: "student",
                endDate: { $gte: today },
            })
            .sort({ important: -1, startDate: 1 })
            .limit(5);

        // --- Are this term's results out? ---
        let resultsPublished = false;
        if (activeTerm && student.classArmId) {
            const publication = await resultPublicationModel.findOne({
                schoolId,
                classArm: student.classArmId,
                term: activeTerm._id,
                session: activeTerm.sessionId,
            });
            resultsPublished = !!publication;
        }

        successResponse(res, 200, null, {
            student,
            classArm: classArm
                ? {
                    _id: classArm._id,
                    label: `${classLevel?.levelShortName || ""} ${classArm.armName?.toUpperCase() || ""}`.trim(),
                    levelName: classLevel?.levelName || "",
                    formTeacher: formTeacher
                        ? `${formTeacher.title ? formTeacher.title + " " : ""}${formTeacher.firstName || ""} ${formTeacher.surname || ""}`.trim()
                        : null,
                }
                : null,
            term: activeTerm
                ? { _id: activeTerm._id, termName: activeTerm.termName }
                : null,
            session: session
                ? { _id: session._id, sessionName: session.sessionName }
                : null,
            attendance,
            subjects,
            announcements,
            resultsPublished,
        });
    } catch (e) {
        console.error("Error loading student portal:", e);
        next(e);
    }
});

exports.getStudentResults = asyncHandler(async (req, res, next) => {
    try {
        const studentId = req.user.id;

        const student = await studentModel.findById(studentId).select("classArmId schoolId");
        if (!student) return next(new ErrorResponse("Student not found", 404));
        if (!student.classArmId) {
            return successResponse(res, 200, null, { available: [], report: null });
        }

        const schoolId = student.schoolId;

        // Which terms have been released for this class?
        const publications = await resultPublicationModel
            .find({ schoolId, classArm: student.classArmId })
            .sort({ publishedAt: -1 });

        if (publications.length === 0) {
            return successResponse(res, 200, null, { available: [], report: null });
        }

        const terms = await termModel.find({
            _id: { $in: publications.map((p) => p.term) },
        });
        const sessions = await sessionModel.find({
            _id: { $in: publications.map((p) => p.session) },
        });

        const available = publications.map((p) => {
            const t = terms.find((x) => String(x._id) === String(p.term));
            const s = sessions.find((x) => String(x._id) === String(p.session));
            return {
                termId: String(p.term),
                termName: t?.termName || "Term",
                sessionId: String(p.session),
                sessionName: s?.sessionName || "",
                publishedAt: p.publishedAt,
            };
        });

        // Requested term, or the most recently published
        let chosen = available[0];
        const { termId, sessionId } = req.query;
        if (termId && sessionId) {
            const match = available.find(
                (a) => a.termId === String(termId) && a.sessionId === String(sessionId)
            );
            if (!match) {
                return next(new ErrorResponse(
                    "That result hasn't been released yet", 403
                ));
            }
            chosen = match;
        }

        const full = await buildClassReport(
            schoolId,
            student.classArmId,
            chosen.termId,
            chosen.sessionId
        );
        if (!full) return next(new ErrorResponse("Could not load your result", 404));

        // Take only this student's entry — the rest of the class is not theirs to see
        const mine = full.reports.find(
            (r) => String(r.student._id) === String(studentId)
        );
        if (!mine) {
            return next(new ErrorResponse("No result found for you in this term", 404));
        }

        successResponse(res, 200, null, {
            available,
            selected: chosen,
            report: {
                classArm: full.classArm,
                formTeacher: full.formTeacher,
                term: full.term,
                session: full.session,
                assessments: full.assessments,
                subjects: full.subjects,
                gradeBands: full.gradeBands,
                mine,
            },
        });
    } catch (e) {
        console.error("Error loading student results:", e);
        next(e);
    }
});