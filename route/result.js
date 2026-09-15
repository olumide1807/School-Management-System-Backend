const { Router } = require("express");
const {
    batchUpsertResults,
    getClassSubjectResults,
    getStudentResult,
} = require("../controller/result");
const multipleProtect = require("../middleware/multipleAuth");

const router = Router();

router.post('/batch', multipleProtect(["super admin", "admin", "academic"]), batchUpsertResults);
router.get('/class/:classArmId/subject/:subjectId', multipleProtect(["super admin", "admin", "academic"]), getClassSubjectResults);
router.get('/student/:studentId', multipleProtect(["super admin", "admin", "academic"]), getStudentResult);

module.exports = router;