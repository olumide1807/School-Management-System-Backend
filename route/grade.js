const express = require('express')

const {createGrade, getGradeById, changeGradeFormat} = require('../controller/grade')
const router = express.Router()

const multiProtect = require("../middleware/multipleAuth");

// create
router.post('/',multiProtect(["super admin"]),createGrade);

// read
router.get('/:id',multiProtect(["super admin"]),getGradeById);

// update
router.put('/:id',multiProtect(["super admin"]),changeGradeFormat)


module.exports = router

