const express = require('express')

const {createGrade, getGradeById, changeGradeFormat, getAllGrades, deleteGrade} = require('../controller/grade')
const router = express.Router()

const multiProtect = require("../middleware/multipleAuth");

// create
router.post('/',multiProtect(["super admin"]),createGrade);

// read
router.get('/',multiProtect(["super admin"]),getAllGrades);
router.get('/:id',multiProtect(["super admin"]),getGradeById);

// update
router.put('/:id',multiProtect(["super admin"]),changeGradeFormat)

// delete
router.delete('/:id',multiProtect(["super admin"]),deleteGrade)

module.exports = router