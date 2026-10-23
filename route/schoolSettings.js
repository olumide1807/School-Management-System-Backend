const express = require("express");
const { getSchoolSettings, updateSchoolSettings, getSchoolInfo, updateBankDetails } = require("../controller/schoolSettings");
const multiProtect = require("../middleware/multipleAuth");

const router = express.Router();

// Students and parents need this for the report card header (school name,
// principal's name). principal._id stays: the staff results page uses it to
// decide who may edit the principal's comment.
router.get("/school-info", multiProtect(["super admin", "admin", "academic", "non-academic", "student", "parent"]), getSchoolInfo);
router.get("/", multiProtect(["super admin", "admin"]), getSchoolSettings);
router.put("/", multiProtect(["super admin"]), updateSchoolSettings);
// Admins too, but only the bank fields — see updateBankDetails
router.put("/bank-details", multiProtect(["super admin", "admin"]), updateBankDetails);

module.exports = router;