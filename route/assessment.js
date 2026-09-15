const { Router } = require('express');
const { createAssessmentFormat, editAssessmentFormat, getAssessmentFormat, getAllAssessmentFormats } = require("../controller/assessment")

const multipleProtect = require("../middleware/multipleAuth");

const router = Router();

// create
router.post('/', multipleProtect(["super admin", "admin"]), createAssessmentFormat);

router.get('/', multipleProtect(["super admin", "admin", "academic"]), getAllAssessmentFormats);
// read
router.get('/:classLevelId', multipleProtect(["super admin", "admin", "academic"]), getAssessmentFormat);

// update
router.put('/:classLevelId', multipleProtect(["super admin", "admin"]), editAssessmentFormat);

module.exports = router;