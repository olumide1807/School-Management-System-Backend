const asyncHandler = require("../middleware/async");
const ErrorResponse = require("../utils/errorResponse");
const { successResponse } = require("../utils/successResponse");
const { isValidMongoId } = require("../utils/isValidMongoObjectId");
const validateBatch = require("../middleware/validation/attendance/batchMark");
const validateUpdate = require("../middleware/validation/attendance/updateRecord");
const {
    studentAttendanceModel,
    studentModel,
    classArmModel,
    sessionModel,
    termModel
} = require("../models");

const getSchoolId = (req) =>
    req.user.schoolName ? req.user.id : req.user.schoolId;

const getRecorderName = (user) => {
    if (user.schoolName) return user.schoolName;
    const parts = [user.firstName, user.surName].filter(Boolean);
    return parts.join(" ") || user.email || "Unknown";
};

// Normalise to start-of-day UTC so all records for the same calendar day collide
const toDayStart = (d) => {
    const date = new Date(d);
    date.setUTCHours(0, 0, 0, 0);
    return date;
};

const startOfLocalDay = (d) => {
    const date = new Date(d);
    date.setHours(0, 0, 0, 0);
    return date;
};
const endOfLocalDay = (d) => {
    const date = new Date(d);
    date.setHours(23, 59, 59, 999);
    return date;
};

const isSuperAdmin = (user) => Boolean(user.schoolName);

/**
 * Determines whether attendance for a given date is editable by the given user.
 * Rule: Class teacher can edit until END OF DAY (today). After that, locked.
 *       Super admin can always edit.
 */
const isEditable = (date, user) => {
    if (isSuperAdmin(user)) return true;
    const today = startOfLocalDay(new Date());
    const targetDay = startOfLocalDay(date);
    return targetDay.getTime() === today.getTime();
};

/**
 * Find the session+term whose date range contains the given date.
 * Returns null if the date is outside any term (holiday).
 */
const resolveSessionTermForDate = async (schoolId, date) => {
    const target = new Date(date);
    const allTerms = await termModel.find({ schoolId });

    const matchingTerm = allTerms.find((t) => {
        if (!t.termStartDate || !t.termEndDate) return false;
        return startOfLocalDay(t.termStartDate) <= target &&
               target <= endOfLocalDay(t.termEndDate);
    });

    if (!matchingTerm) return { session: null, term: null };

    const session = await sessionModel.findById(matchingTerm.sessionId);
    return { session, term: matchingTerm };
};

// ============================================================
// BATCH MARK CLASS ATTENDANCE
// POST /attendance/class
// ============================================================
exports.markClassAttendance = asyncHandler(async (req, res, next) => {
    try {
        const { error } = validateBatch(req.body);
        if (error) {
            return next(new ErrorResponse(error.details[0].message, 400));
        }

        const schoolId = getSchoolId(req);
        const { classArmId, date, records } = req.body;

        if (!isValidMongoId(classArmId)) {
            return next(new ErrorResponse("Invalid classArmId", 400));
        }

        const targetDate = new Date(date);
        const today = endOfLocalDay(new Date());

        // GUARD: No future dates
        if (startOfLocalDay(targetDate) > today) {
            return next(new ErrorResponse(
                "Cannot mark attendance for a future date", 400
            ));
        }

        const classArm = await classArmModel.findOne({ _id: classArmId, schoolId });
        if (!classArm) {
            return next(new ErrorResponse("Class arm not found in your school", 404));
        }

        // Permission: super admin or assigned class teacher
        if (!isSuperAdmin(req.user) &&
            classArm.assignedTeacher?.toString() !== req.user.id.toString()) {
            return next(new ErrorResponse(
                "Only the class teacher can mark attendance for this class", 403
            ));
        }

        // GUARD: date must fall inside an active term
        const { session, term } = await resolveSessionTermForDate(schoolId, targetDate);
        if (!session || !term) {
            return next(new ErrorResponse(
                "Cannot mark attendance: the selected date does not fall within an active term.", 400
            ));
        }

        // GUARD: Locking — class teacher can only mark/edit TODAY's attendance
        if (!isEditable(targetDate, req.user)) {
            return next(new ErrorResponse(
                "This date's attendance is locked. Only super admin can edit past records.", 403
            ));
        }

        const dayStart = toDayStart(targetDate);
        const recorderName = getRecorderName(req.user);

        // For each record, decide between insert (new) or update (only if not yet locked)
        // Since we already passed the date-level lock check above, all updates here are allowed.
        const bulkOps = records.map((r) => ({
            updateOne: {
                filter: { studentId: r.studentId, date: dayStart },
                update: {
                    $set: {
                        status: r.status,
                        schoolId,
                        classArmId,
                        sessionId: session._id,
                        termId: term._id,
                        recordedBy: req.user.id,
                        recordedByName: recorderName
                    }
                },
                upsert: true
            }
        }));

        const result = await studentAttendanceModel.bulkWrite(bulkOps);

        successResponse(res, 200, "Attendance recorded successfully", {
            created: result.upsertedCount,
            updated: result.modifiedCount,
            total: records.length,
            sessionName: session.sessionName,
            termName: term.termName
        });
    } catch (e) {
        console.error("Error marking class attendance:", e);
        next(e);
    }
});

// ============================================================
// GET CLASS ATTENDANCE
// ============================================================
exports.getClassAttendance = asyncHandler(async (req, res, next) => {
    try {
        const schoolId = getSchoolId(req);
        const { classArmId, date, startDate, endDate, studentId, status } = req.query;

        const filter = { schoolId };

        if (classArmId) {
            if (!isValidMongoId(classArmId)) {
                return next(new ErrorResponse("Invalid classArmId", 400));
            }
            filter.classArmId = classArmId;
        }
        if (studentId) {
            if (!isValidMongoId(studentId)) {
                return next(new ErrorResponse("Invalid studentId", 400));
            }
            filter.studentId = studentId;
        }
        if (status && ["present", "absent"].includes(status)) {
            filter.status = status;
        }

        if (date) {
            const dayStart = toDayStart(date);
            const dayEnd = new Date(dayStart);
            dayEnd.setUTCHours(23, 59, 59, 999);
            filter.date = { $gte: dayStart, $lte: dayEnd };
        } else if (startDate || endDate) {
            filter.date = {};
            if (startDate) filter.date.$gte = toDayStart(startDate);
            if (endDate) {
                const end = toDayStart(endDate);
                end.setUTCHours(23, 59, 59, 999);
                filter.date.$lte = end;
            }
        }

        const records = await studentAttendanceModel
            .find(filter)
            .sort({ date: -1 });

        successResponse(res, 200, null, records);
    } catch (e) {
        console.error("Error getting attendance:", e);
        next(e);
    }
});

// ============================================================
// GET STUDENT ATTENDANCE
// ============================================================
exports.getStudentAttendance = asyncHandler(async (req, res, next) => {
    try {
        const schoolId = getSchoolId(req);
        const { studentId } = req.params;

        if (!isValidMongoId(studentId)) {
            return next(new ErrorResponse("Invalid studentId", 400));
        }

        const records = await studentAttendanceModel
            .find({ schoolId, studentId })
            .sort({ date: -1 });

        successResponse(res, 200, null, records);
    } catch (e) {
        console.error("Error getting student attendance:", e);
        next(e);
    }
});

// ============================================================
// UPDATE A SINGLE RECORD (subject to lock rules)
// ============================================================
exports.updateAttendanceRecord = asyncHandler(async (req, res, next) => {
    try {
        const { error } = validateUpdate(req.body);
        if (error) {
            return next(new ErrorResponse(error.details[0].message, 400));
        }

        const schoolId = getSchoolId(req);
        const { id } = req.params;

        if (!isValidMongoId(id)) {
            return next(new ErrorResponse("Invalid record id", 400));
        }

        const record = await studentAttendanceModel.findOne({ _id: id, schoolId });
        if (!record) {
            return next(new ErrorResponse("Attendance record not found", 404));
        }

        // Permission check (assigned class teacher or super admin)
        const classArm = await classArmModel.findById(record.classArmId);
        if (!isSuperAdmin(req.user) &&
            classArm?.assignedTeacher?.toString() !== req.user.id.toString()) {
            return next(new ErrorResponse(
                "Only the class teacher can update attendance for this class", 403
            ));
        }

        // Lock check
        if (!isEditable(record.date, req.user)) {
            return next(new ErrorResponse(
                "This record is locked. Only super admin can edit past records.", 403
            ));
        }

        record.status = req.body.status;
        record.recordedBy = req.user.id;
        record.recordedByName = getRecorderName(req.user);
        await record.save();

        successResponse(res, 200, "Attendance updated", record);
    } catch (e) {
        console.error("Error updating attendance:", e);
        next(e);
    }
});

// ============================================================
// DELETE A SINGLE RECORD (subject to lock rules)
// ============================================================
exports.deleteAttendanceRecord = asyncHandler(async (req, res, next) => {
    try {
        const schoolId = getSchoolId(req);
        const { id } = req.params;

        if (!isValidMongoId(id)) {
            return next(new ErrorResponse("Invalid record id", 400));
        }

        const record = await studentAttendanceModel.findOne({ _id: id, schoolId });
        if (!record) {
            return next(new ErrorResponse("Attendance record not found", 404));
        }

        const classArm = await classArmModel.findById(record.classArmId);
        if (!isSuperAdmin(req.user) &&
            classArm?.assignedTeacher?.toString() !== req.user.id.toString()) {
            return next(new ErrorResponse(
                "Only the class teacher can delete attendance for this class", 403
            ));
        }

        if (!isEditable(record.date, req.user)) {
            return next(new ErrorResponse(
                "This record is locked. Only super admin can delete past records.", 403
            ));
        }

        await studentAttendanceModel.findByIdAndDelete(id);
        successResponse(res, 200, "Attendance record deleted");
    } catch (e) {
        console.error("Error deleting attendance:", e);
        next(e);
    }
});

// ============================================================
// SUMMARY
// ============================================================
exports.getAttendanceSummary = asyncHandler(async (req, res, next) => {
    try {
        const schoolId = getSchoolId(req);
        const { classArmId, startDate, endDate, studentId } = req.query;

        const filter = { schoolId };
        if (classArmId) {
            if (!isValidMongoId(classArmId)) {
                return next(new ErrorResponse("Invalid classArmId", 400));
            }
            filter.classArmId = classArmId;
        }
        if (studentId) {
            if (!isValidMongoId(studentId)) {
                return next(new ErrorResponse("Invalid studentId", 400));
            }
            filter.studentId = studentId;
        }
        if (startDate || endDate) {
            filter.date = {};
            if (startDate) filter.date.$gte = toDayStart(startDate);
            if (endDate) {
                const end = toDayStart(endDate);
                end.setUTCHours(23, 59, 59, 999);
                filter.date.$lte = end;
            }
        }

        const records = await studentAttendanceModel.find(filter);
        const summary = {
            totalRecords: records.length,
            present: records.filter((r) => r.status === "present").length,
            absent: records.filter((r) => r.status === "absent").length,
            attendanceRate: 0,
            byStudent: {}
        };
        if (summary.totalRecords > 0) {
            summary.attendanceRate = Math.round(
                (summary.present / summary.totalRecords) * 100
            );
        }
        records.forEach((r) => {
            const sid = r.studentId.toString();
            if (!summary.byStudent[sid]) {
                summary.byStudent[sid] = { present: 0, absent: 0, total: 0 };
            }
            summary.byStudent[sid][r.status]++;
            summary.byStudent[sid].total++;
        });

        successResponse(res, 200, null, summary);
    } catch (e) {
        console.error("Error getting attendance summary:", e);
        next(e);
    }
});