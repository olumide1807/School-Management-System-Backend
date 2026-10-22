const { Router } = require("express");
const {
    getStudentPortalHome,
    getStudentResults,
    getStudentAttendance,
    getParentPortalHome,
    getChildProfile,
    getChildResults,
    getChildAttendance,
    getChildFees,
} = require("../controller/portal");
const multipleProtect = require("../middleware/multipleAuth");

const router = Router();

router.get("/student/me", multipleProtect(["student"]), getStudentPortalHome);
router.get("/student/results", multipleProtect(["student"]), getStudentResults);
router.get("/student/attendance", multipleProtect(["student"]), getStudentAttendance);
router.get("/parent/me", multipleProtect(["parent"]), getParentPortalHome);
router.get("/child/:childId/profile", multipleProtect(["parent"]), getChildProfile);
router.get("/child/:childId/results", multipleProtect(["parent"]), getChildResults);
router.get("/child/:childId/attendance", multipleProtect(["parent"]), getChildAttendance);
router.get("/child/:childId/fees", multipleProtect(["parent"]), getChildFees);

module.exports = router;