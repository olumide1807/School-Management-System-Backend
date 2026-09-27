const { Router } = require("express");
const { getStudentPortalHome, getStudentResults } = require("../controller/portal");
const multipleProtect = require("../middleware/multipleAuth");

const router = Router();

router.get("/student/me", multipleProtect(["student"]), getStudentPortalHome);
router.get("/student/results", multipleProtect(["student"]), getStudentResults);

module.exports = router;