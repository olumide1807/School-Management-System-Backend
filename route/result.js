const { Router } = require("express");
const multipleProtect = require("../middleware/multipleAuth");
const {createResult, editResult,getStudentResult} = require('../controller/result')

const router = Router()


router.post('/upload-result',createResult)
router.put('/edit-result',editResult)
router.get('/get-result', getStudentResult)


module.exports = router