const asyncHandler = require("../middleware/async");
const ErrorResponse = require("../utils/errorResponse");
const { successResponse } = require("../utils/successResponse");
const { isValidMongoId } = require("../utils/isValidMongoObjectId");
const validateBatch = require("../middleware/validation/staffAttendance/batchMark");
const { staffAttendanceModel, schoolSettingsModel } = require("../models");

const getSchoolId = (req) =>
    req.user.schoolName ? req.user.id : req.user.schoolId;

const getRecorderName = (user) => {
    if (user.schoolName) return user.schoolName;
    const parts = [user.firstName, user.surName].filter(Boolean);
    return parts.join(" ") || user.email || "Unknown";
};

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

const isSuperAdmin = (user) => Boolean(user.schoolName);

const isEditable = (date, user) => {
    if (isSuperAdmin(user)) return true;
    const today = startOfLocalDay(new Date());
    const targetDay = startOfLocalDay(date);
    return targetDay.getTime() === today.getTime();
};

/**
 * Convert "HH:MM" string to total minutes since midnight
 */
const timeToMinutes = (timeStr) => {
    if (!timeStr) return null;
    const [hours, minutes] = timeStr.split(":").map(Number);
    return hours * 60 + minutes;
};

/**
 * Auto-derive attendance status from check-in time.
 * - If no checkInTime → keep the manually set status (absent / on_leave)
 * - If checkInTime <= startTime + gracePeriod → "present"
 * - If checkInTime > startTime + gracePeriod → "late"
 */
const deriveStatus = (providedStatus, checkInTime, schoolStartTime, gracePeriodMinutes) => {
    // Non-present statuses don't need time logic
    if (providedStatus === "absent" || providedStatus === "on_leave") {
        return providedStatus;
    }

    // If no check-in time provided, just use "present"
    if (!checkInTime) return "present";

    const checkInMinutes = timeToMinutes(checkInTime);
    const startMinutes = timeToMinutes(schoolStartTime || "08:00");
    const graceMinutes = gracePeriodMinutes || 15;
    const cutoffMinutes = startMinutes + graceMinutes;

    return checkInMinutes <= cutoffMinutes ? "present" : "late";
};

// ============================================================
// GET ATTENDANCE SETTINGS
// ============================================================
const getAttendanceSettings = async (schoolId) => {
    const settings = await schoolSettingsModel.findOne({ schoolId });
    return {
        schoolStartTime: settings?.attendanceSettings?.schoolStartTime || "08:00",
        gracePeriodMinutes: settings?.attendanceSettings?.gracePeriodMinutes ?? 15,
    };
};

// ============================================================
// BATCH MARK
// POST /staff-attendance/mark
// body: { date, records: [{staffId, status, checkInTime?, note?}] }
// ============================================================
exports.markStaffAttendance = asyncHandler(async (req, res, next) => {
    try {
        const { error } = validateBatch(req.body);
        if (error) {
            return next(new ErrorResponse(error.details[0].message, 400));
        }

        const schoolId = getSchoolId(req);
        const { date, records } = req.body;
        const targetDate = new Date(date);
        const today = new Date();
        today.setHours(23, 59, 59, 999);

        if (startOfLocalDay(targetDate) > today) {
            return next(new ErrorResponse("Cannot mark attendance for a future date", 400));
        }

        if (!isEditable(targetDate, req.user)) {
            return next(new ErrorResponse(
                "This date's attendance is locked. Only super admin can edit past records.", 403
            ));
        }

        // Get school attendance settings for late detection
        const { schoolStartTime, gracePeriodMinutes } = await getAttendanceSettings(schoolId);

        const dayStart = toDayStart(targetDate);
        const recorderName = getRecorderName(req.user);

        const bulkOps = records.map((r) => {
            // Auto-derive status from check-in time
            const derivedStatus = deriveStatus(r.status, r.checkInTime, schoolStartTime, gracePeriodMinutes);

            return {
                updateOne: {
                    filter: { staffId: r.staffId, date: dayStart },
                    update: {
                        $set: {
                            status: derivedStatus,
                            checkInTime: r.checkInTime || null,
                            note: r.note || "",
                            schoolId,
                            recordedBy: req.user.id,
                            recordedByName: recorderName
                        }
                    },
                    upsert: true
                }
            };
        });

        const result = await staffAttendanceModel.bulkWrite(bulkOps);

        successResponse(res, 200, "Staff attendance recorded successfully", {
            created: result.upsertedCount,
            updated: result.modifiedCount,
            total: records.length,
            schoolStartTime,
            gracePeriodMinutes,
        });
    } catch (e) {
        console.error("Error marking staff attendance:", e);
        next(e);
    }
});

// ============================================================
// GET STAFF ATTENDANCE
// GET /staff-attendance?date=Y or ?startDate=Y&endDate=Z
// ============================================================
exports.getStaffAttendance = asyncHandler(async (req, res, next) => {
    try {
        const schoolId = getSchoolId(req);
        const { date, startDate, endDate, staffId, status } = req.query;
        const filter = { schoolId };

        if (staffId) {
            if (!isValidMongoId(staffId)) return next(new ErrorResponse("Invalid staffId", 400));
            filter.staffId = staffId;
        }
        if (status && ["present", "absent", "late", "on_leave"].includes(status)) {
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

        const records = await staffAttendanceModel.find(filter).sort({ date: -1 });
        successResponse(res, 200, null, records);
    } catch (e) {
        console.error("Error getting staff attendance:", e);
        next(e);
    }
});

// ============================================================
// GET SINGLE STAFF HISTORY
// GET /staff-attendance/staff/:staffId
// ============================================================
exports.getSingleStaffAttendance = asyncHandler(async (req, res, next) => {
    try {
        const schoolId = getSchoolId(req);
        const { staffId } = req.params;
        if (!isValidMongoId(staffId)) return next(new ErrorResponse("Invalid staffId", 400));
        // Non-admins may only read their own record
        const isAdminRole = req.user.userType === "admin";
        if (!isAdminRole && String(staffId) !== String(req.user.id)) {
            return next(new ErrorResponse("You can only view your own attendance", 403));
        }
        const records = await staffAttendanceModel.find({ schoolId, staffId }).sort({ date: -1 });
        
        successResponse(res, 200, null, records);
    } catch (e) {
        console.error("Error getting staff attendance:", e);
        next(e);
    }
});

// ============================================================
// UPDATE SINGLE RECORD
// PUT /staff-attendance/:id
// ============================================================
exports.updateStaffAttendance = asyncHandler(async (req, res, next) => {
    try {
        const schoolId = getSchoolId(req);
        const { id } = req.params;
        const { status, checkInTime, note } = req.body;

        if (!isValidMongoId(id)) return next(new ErrorResponse("Invalid record id", 400));

        const record = await staffAttendanceModel.findOne({ _id: id, schoolId });
        if (!record) return next(new ErrorResponse("Record not found", 404));

        if (!isEditable(record.date, req.user)) {
            return next(new ErrorResponse("This record is locked.", 403));
        }

        // Get settings for late detection
        const { schoolStartTime, gracePeriodMinutes } = await getAttendanceSettings(schoolId);
        const derivedStatus = deriveStatus(status, checkInTime, schoolStartTime, gracePeriodMinutes);

        record.status = derivedStatus;
        record.checkInTime = checkInTime || null;
        if (note !== undefined) record.note = note;
        record.recordedBy = req.user.id;
        record.recordedByName = getRecorderName(req.user);
        await record.save();

        successResponse(res, 200, "Attendance updated", record);
    } catch (e) {
        console.error("Error updating staff attendance:", e);
        next(e);
    }
});