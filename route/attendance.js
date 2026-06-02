const express = require("express");
const {
    markClassAttendance,
    getClassAttendance,
    getStudentAttendance,
    updateAttendanceRecord,
    deleteAttendanceRecord,
    getAttendanceSummary
} = require("../controller/attendance");
const multiProtect = require("../middleware/multipleAuth");

const router = express.Router();

// Batch mark attendance for a class (main endpoint teachers use)
router.post(
    "/class",
    multiProtect(["super admin", "staff", "academic"]),
    markClassAttendance
);

// Get attendance records (supports ?classArmId=X&date=Y or date range)
router.get(
    "/",
    multiProtect(["super admin", "staff", "admin", "academic"]),
    getClassAttendance
);

// Summary/stats
router.get(
    "/summary",
    multiProtect(["super admin", "staff", "admin", "academic"]),
    getAttendanceSummary
);

// Single student's full attendance history
router.get(
    "/student/:studentId",
    multiProtect(["super admin", "staff", "admin", "academic"]),
    getStudentAttendance
);

// Update / delete a specific record
router.put(
    "/:id",
    multiProtect(["super admin", "staff", "academic"]),
    updateAttendanceRecord
);

router.delete(
    "/:id",
    multiProtect(["super admin", "staff", "academic"]),
    deleteAttendanceRecord
);

module.exports = router;
