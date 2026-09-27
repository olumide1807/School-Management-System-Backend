const { Router } = require("express");
const { getStudentPortalHome, getStudentResults, getStudentAttendance, getParentPortalHome } = require("../controller/portal");
const multipleProtect = require("../middleware/multipleAuth");

const router = Router();

router.get("/student/me", multipleProtect(["student"]), getStudentPortalHome);
router.get("/student/results", multipleProtect(["student"]), getStudentResults);
router.get("/student/attendance", multipleProtect(["student"]), getStudentAttendance);
router.get("/parent/me", multipleProtect(["parent"]), getParentPortalHome);

module.exports = router;