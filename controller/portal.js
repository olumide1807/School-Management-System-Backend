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
const { schoolCalendarModel } = require("../models");

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
            const present = records.filter((r) => r.status === "present" && !r.autoMarked).length;
            const absent = records.filter((r) => r.status === "absent" && !r.autoMarked).length;
            const scored = present + absent;
            attendance = {
                present,
                absent,
                total: scored,
                percentage: scored > 0 ? Math.round((present / scored) * 100) : null,
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

exports.getStudentAttendance = asyncHandler(async (req, res, next) => {
    try {
        const studentId = req.user.id;

        const student = await studentModel.findById(studentId).select("classArmId schoolId");
        if (!student) return next(new ErrorResponse("Student not found", 404));

        const schoolId = student.schoolId;

        // --- Which terms can this student look at? ---
        const allRecords = await studentAttendanceModel
            .find({ schoolId, studentId })
            .select("termId");

        const termIds = [...new Set(allRecords.map((r) => String(r.termId)).filter(Boolean))];

        const activeTerm = await termModel.findOne({ schoolId, currentTerm: true });
        if (activeTerm && !termIds.includes(String(activeTerm._id))) {
            termIds.push(String(activeTerm._id));
        }

        const terms = await termModel.find({ _id: { $in: termIds } }).sort({ termStartDate: -1 });
        const sessions = await sessionModel.find({
            _id: { $in: [...new Set(terms.map((t) => String(t.sessionId)))] },
        });

        const available = terms.map((t) => {
            const s = sessions.find((x) => String(x._id) === String(t.sessionId));
            return {
                termId: String(t._id),
                termName: t.termName,
                sessionId: String(t.sessionId),
                sessionName: s?.sessionName || "",
                isCurrent: !!t.currentTerm,
            };
        });

        const emptyPayload = {
            available,
            selected: null,
            summary: { present: 0, absent: 0, notMarked: 0, total: 0, percentage: null },
            days: [],
        };

        if (available.length === 0) {
            return successResponse(res, 200, null, emptyPayload);
        }

        const requested = req.query.termId ? String(req.query.termId) : null;
        const chosen =
            available.find((a) => a.termId === requested) ||
            available.find((a) => a.isCurrent) ||
            available[0];

        const term = terms.find((t) => String(t._id) === chosen.termId);
        if (!term?.termStartDate || !term?.termEndDate) {
            // No dates set, so the term's shape is unknown — fall back to
            // whatever was recorded rather than showing nothing
            const records = await studentAttendanceModel
                .find({ schoolId, studentId, termId: chosen.termId })
                .sort({ date: 1 });

            const present = records.filter((r) => r.status === "present" && !r.autoMarked).length;
            const absent = records.filter((r) => r.status === "absent" && !r.autoMarked).length;
            const notMarked = records.filter((r) => r.autoMarked).length;
            const scored = present + absent;

            return successResponse(res, 200, null, {
                available,
                selected: chosen,
                summary: {
                    present, absent, notMarked, total: records.length,
                    percentage: scored > 0 ? Math.round((present / scored) * 100) : null,
                },
                days: records.map((r) => ({
                    date: r.date,
                    status: r.autoMarked ? "not_marked" : r.status,
                })),
            });
        }

        const [records, closures] = await Promise.all([
            studentAttendanceModel
                .find({ schoolId, studentId, termId: chosen.termId })
                .sort({ date: 1 }),
            schoolCalendarModel.find({
                schoolId,
                startDate: { $lte: term.termEndDate },
                endDate: { $gte: term.termStartDate },
            }),
        ]);

        const key = (d) => new Date(d).toISOString().split("T")[0];

        const recordByDay = {};
        records.forEach((r) => { recordByDay[key(r.date)] = r; });

        const isClosed = (day) =>
            closures.some(
                (c) => new Date(c.startDate) <= day && day <= new Date(c.endDate)
            );

        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);

        // Walk the term, keeping weekdays the school was open
        const days = [];
        const cursor = new Date(term.termStartDate);
        cursor.setUTCHours(0, 0, 0, 0);
        const end = new Date(term.termEndDate);
        end.setUTCHours(0, 0, 0, 0);

        let guard = 0;
        while (cursor <= end && guard < 400) {
            guard++;
            const weekday = cursor.getUTCDay();
            if (weekday !== 0 && weekday !== 6 && !isClosed(cursor)) {
                const record = recordByDay[key(cursor)];
                let status;
                if (record) {
                    status = record.autoMarked ? "not_marked" : record.status;
                } else if (cursor > today) {
                    status = "upcoming";
                } else {
                    status = "not_marked";
                }
                days.push({ date: new Date(cursor), status });
            }
            cursor.setUTCDate(cursor.getUTCDate() + 1);
        }

        const present = days.filter((d) => d.status === "present").length;
        const absent = days.filter((d) => d.status === "absent").length;
        const notMarked = days.filter((d) => d.status === "not_marked").length;
        const upcoming = days.filter((d) => d.status === "upcoming").length;
        const scored = present + absent;

        successResponse(res, 200, null, {
            available,
            selected: {
                ...chosen,
                startDate: term.termStartDate,
                endDate: term.termEndDate,
            },
            summary: {
                present,
                absent,
                notMarked,
                upcoming,
                total: days.length - upcoming,
                percentage: scored > 0 ? Math.round((present / scored) * 100) : null,
            },
            days,
        });
    } catch (e) {
        console.error("Error loading student attendance:", e);
        next(e);
    }
});