const { Router } = require("express");
const {
    batchUpsertResults,
    getClassSubjectResults,
    getStudentResult,
    getClassReport,
    upsertComments,
    publishResults,
    unpublishResults,
} = require("../controller/result");
const multipleProtect = require("../middleware/multipleAuth");

const router = Router();

router.post('/batch', multipleProtect(["super admin", "admin", "academic"]), batchUpsertResults);
router.put('/comments', multipleProtect(["super admin", "admin", "academic"]), upsertComments);
router.post('/publish', multipleProtect(["super admin", "admin"]), publishResults);
router.delete('/publish', multipleProtect(["super admin", "admin"]), unpublishResults);
router.get('/class/:classArmId/subject/:subjectId', multipleProtect(["super admin", "admin", "academic"]), getClassSubjectResults);
router.get('/student/:studentId', multipleProtect(["super admin", "admin", "academic"]), getStudentResult);
router.get('/report/class/:classArmId', multipleProtect(["super admin", "admin", "academic"]), getClassReport);

module.exports = router;