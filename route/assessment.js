const { Router } = require('express');
const { createAssessmentFormat, editAssessmentFormat, getAssessmentFormat } = require("../controller/assessment")

const multipleProtect = require("../middleware/multipleAuth");

const router = Router();

// create
router.post('/', multipleProtect(["super admin", "admin"]), createAssessmentFormat);

// read
router.get('/', multipleProtect(["super admin", "admin"]), getAssessmentFormat);

// update
router.put('/', multipleProtect(["super admin", "admin"]), editAssessmentFormat);

module.exports = router;