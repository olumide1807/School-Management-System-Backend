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
    parentModel,
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

// ============================================================
// SHARED STUDENT VIEWS
//
// The student portal and the parent's per-child view return the
// same payloads, so the frontend can reuse one component. Both
// call these; neither builds its own. Each returns { data } or
// { error } — the caller has already established who the student
// is and that the requester may see them.
// ============================================================

// Published terms only: a term with no resultPublication row for the
// student's class arm is never listed and never built.
const loadStudentResults = async (schoolId, studentId, classArmId, query) => {
    if (!classArmId) return { data: { available: [], report: null } };

    // Which terms have been released for this class?
    const publications = await resultPublicationModel
        .find({ schoolId, classArm: classArmId })
        .sort({ publishedAt: -1 });

    if (publications.length === 0) {
        return { data: { available: [], report: null } };
    }

    const [terms, sessions] = await Promise.all([
        termModel.find({ schoolId, _id: { $in: publications.map((p) => p.term) } }),
        sessionModel.find({ schoolId, _id: { $in: publications.map((p) => p.session) } }),
    ]);

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
    const { termId, sessionId } = query;
    if (termId && sessionId) {
        const match = available.find(
            (a) => a.termId === String(termId) && a.sessionId === String(sessionId)
        );
        if (!match) {
            return { error: new ErrorResponse("That result hasn't been released yet", 403) };
        }
        chosen = match;
    }

    const full = await buildClassReport(schoolId, classArmId, chosen.termId, chosen.sessionId);
    if (!full) return { error: new ErrorResponse("Could not load the result", 404) };

    // Take only this student's entry — the rest of the class is not theirs to see
    const mine = full.reports.find(
        (r) => String(r.student._id) === String(studentId)
    );
    if (!mine) {
        return { error: new ErrorResponse("No result found for this term", 404) };
    }

    return {
        data: {
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
        },
    };
};

const loadStudentAttendance = async (schoolId, studentId, query) => {
    // --- Which terms can this student look at? ---
    const allRecords = await studentAttendanceModel
        .find({ schoolId, studentId })
        .select("termId");

    const termIds = [...new Set(allRecords.map((r) => String(r.termId)).filter(Boolean))];

    const activeTerm = await termModel.findOne({ schoolId, currentTerm: true });
    if (activeTerm && !termIds.includes(String(activeTerm._id))) {
        termIds.push(String(activeTerm._id));
    }

    const terms = await termModel
        .find({ schoolId, _id: { $in: termIds } })
        .sort({ termStartDate: -1 });
    const sessions = await sessionModel.find({
        schoolId,
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
        return { data: emptyPayload };
    }

    const requested = query.termId ? String(query.termId) : null;
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

        return {
            data: {
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
            },
        };
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

    return {
        data: {
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
        },
    };
};

exports.getStudentResults = asyncHandler(async (req, res, next) => {
    try {
        const studentId = req.user.id;

        const student = await studentModel.findById(studentId).select("classArmId schoolId");
        if (!student) return next(new ErrorResponse("Student not found", 404));

        const { data, error } = await loadStudentResults(
            student.schoolId, studentId, student.classArmId, req.query
        );
        if (error) return next(error);
        successResponse(res, 200, null, data);
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

        const { data, error } = await loadStudentAttendance(student.schoolId, studentId, req.query);
        if (error) return next(error);
        successResponse(res, 200, null, data);
    } catch (e) {
        console.error("Error loading student attendance:", e);
        next(e);
    }
});

// ============================================================
// PARENT → ONE CHILD
// GET /portal/child/:childId/{profile,results,attendance}
// ============================================================

const getSchoolId = (req) => (req.user.schoolName ? req.user.id : req.user.schoolId);

// The guardianship check. Returns the child only if they belong to the
// requester's school AND the requester is one of their guardians;
// otherwise null. Every "no" — malformed id, other school, other
// family — is the same null, so the caller answers with one identical
// 404 and a parent can't probe which student IDs exist.
const findGuardedChild = async (req) => {
    const { childId } = req.params;
    if (!isValidMongoId(childId)) return null;

    const schoolId = getSchoolId(req);
    // An undefined schoolId would be silently dropped from the query
    if (!schoolId) return null;

    // password is select:false on the model; strip the other secrets too
    const child = await studentModel
        .findOne({ _id: childId, schoolId })
        .select("-resetPasswordToken -resetPasswordExpire -mustChangePassword");
    if (!child) return null;

    const isGuardian = (child.guardians || []).some(
        (g) => String(g.parentId) === String(req.user._id)
    );
    return isGuardian ? child : null;
};

const childNotFound = () => new ErrorResponse("Child not found", 404);

exports.getChildProfile = asyncHandler(async (req, res, next) => {
    try {
        const child = await findGuardedChild(req);
        if (!child) return next(childNotFound());

        const schoolId = getSchoolId(req);

        const classArm = child.classArmId
            ? await classArmModel.findOne({ _id: child.classArmId, schoolId })
            : null;
        const [classLevel, formTeacher] = await Promise.all([
            classArm
                ? classLevelModel.findOne({ _id: classArm.classLevelId, schoolId })
                : null,
            classArm?.assignedTeacher
                ? staffModel
                    .findOne({ _id: classArm.assignedTeacher, schoolId })
                    .select("title firstName surname")
                : null,
        ]);

        const guardian = child.guardians.find(
            (g) => String(g.parentId) === String(req.user._id)
        );

        // The other guardians' ids are not this parent's business
        const { guardians, ...profile } = child.toObject();

        successResponse(res, 200, null, {
            child: profile,
            relationship: guardian?.relationship || null,
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
        });
    } catch (e) {
        console.error("Error loading child profile:", e);
        next(e);
    }
});

exports.getChildResults = asyncHandler(async (req, res, next) => {
    try {
        const child = await findGuardedChild(req);
        if (!child) return next(childNotFound());

        const { data, error } = await loadStudentResults(
            getSchoolId(req), child._id, child.classArmId, req.query
        );
        if (error) return next(error);
        successResponse(res, 200, null, data);
    } catch (e) {
        console.error("Error loading child results:", e);
        next(e);
    }
});

exports.getChildAttendance = asyncHandler(async (req, res, next) => {
    try {
        const child = await findGuardedChild(req);
        if (!child) return next(childNotFound());

        const { data, error } = await loadStudentAttendance(getSchoolId(req), child._id, req.query);
        if (error) return next(error);
        successResponse(res, 200, null, data);
    } catch (e) {
        console.error("Error loading child attendance:", e);
        next(e);
    }
});

exports.getParentPortalHome = asyncHandler(async (req, res, next) => {
    try {
        const parentId = req.user.id;

        const parent = await parentModel
            .findById(parentId)
            .select("-password -resetPasswordToken -resetPasswordExpire");

        if (!parent) return next(new ErrorResponse("Parent not found", 404));

        const schoolId = parent.schoolId;

        const [children, activeTerm] = await Promise.all([
            studentModel
                .find({ "guardians.parentId": parentId, schoolId })
                .select("firstName surName otherName studentID photo classArmId guardians status"),
            termModel.findOne({ schoolId, currentTerm: true }),
        ]);

        const session = activeTerm
            ? await sessionModel.findById(activeTerm.sessionId)
            : null;

        // Class labels for every arm the children are in
        const armIds = [...new Set(children.map((c) => String(c.classArmId)).filter(Boolean))];
        const arms = await classArmModel.find({ _id: { $in: armIds } });
        const levels = await classLevelModel.find({
            _id: { $in: [...new Set(arms.map((a) => String(a.classLevelId)))] },
        });

        const armLabel = (armId) => {
            const arm = arms.find((a) => String(a._id) === String(armId));
            if (!arm) return null;
            const level = levels.find((l) => String(l._id) === String(arm.classLevelId));
            return `${level?.levelShortName || ""} ${arm.armName?.toUpperCase() || ""}`.trim();
        };

        const enriched = await Promise.all(
            children.map(async (child) => {
                const guardian = child.guardians?.find(
                    (g) => String(g.parentId) === String(parentId)
                );

                let attendance = { present: 0, absent: 0, total: 0, percentage: null };
                let resultsPublished = false;

                if (activeTerm) {
                    const records = await studentAttendanceModel.find({
                        schoolId,
                        studentId: child._id,
                        termId: activeTerm._id,
                    });
                    // Days the register was actually taken — a missed
                    // register is the school's omission, not the child's
                    const present = records.filter(
                        (r) => r.status === "present" && !r.autoMarked
                    ).length;
                    const absent = records.filter(
                        (r) => r.status === "absent" && !r.autoMarked
                    ).length;
                    const scored = present + absent;
                    attendance = {
                        present,
                        absent,
                        total: scored,
                        percentage: scored > 0 ? Math.round((present / scored) * 100) : null,
                    };

                    if (child.classArmId) {
                        const publication = await resultPublicationModel.findOne({
                            schoolId,
                            classArm: child.classArmId,
                            term: activeTerm._id,
                            session: activeTerm.sessionId,
                        });
                        resultsPublished = !!publication;
                    }
                }

                return {
                    _id: child._id,
                    firstName: child.firstName,
                    surName: child.surName,
                    otherName: child.otherName,
                    studentID: child.studentID,
                    photo: child.photo,
                    status: child.status,
                    relationship: guardian?.relationship || null,
                    classLabel: armLabel(child.classArmId),
                    attendance,
                    resultsPublished,
                };
            })
        );

        // Announcements addressed to families
        const today = new Date();
        const announcements = await announcementModel
            .find({ schoolId, visibleTo: "student", endDate: { $gte: today } })
            .sort({ important: -1, startDate: 1 })
            .limit(5);

        successResponse(res, 200, null, {
            parent,
            children: enriched,
            term: activeTerm
                ? { _id: activeTerm._id, termName: activeTerm.termName }
                : null,
            session: session
                ? { _id: session._id, sessionName: session.sessionName }
                : null,
            announcements,
        });
    } catch (e) {
        console.error("Error loading parent portal:", e);
        next(e);
    }
});