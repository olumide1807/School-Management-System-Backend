const express = require('express')

const {createGrade, getGradeById, changeGradeFormat, getAllGrades, deleteGrade} = require('../controller/grade')
const router = express.Router()

const multiProtect = require("../middleware/multipleAuth");

// create — only super admin
router.post('/', multiProtect(["super admin"]), createGrade);

// read — all staff can view grading format
router.get('/', multiProtect(["super admin", "admin", "academic", "non-academic"]), getAllGrades);
router.get('/:id', multiProtect(["super admin", "admin", "academic", "non-academic"]), getGradeById);

// update — only super admin
router.put('/:id', multiProtect(["super admin"]), changeGradeFormat)

// delete — only super admin
router.delete('/:id', multiProtect(["super admin"]), deleteGrade)

module.exports = router