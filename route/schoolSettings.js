const express = require("express");
const { getSchoolSettings, updateSchoolSettings, getSchoolInfo } = require("../controller/schoolSettings");
const multiProtect = require("../middleware/multipleAuth");

const router = express.Router();

router.get("/school-info", multiProtect(["super admin", "admin", "academic", "non-academic"]), getSchoolInfo);
router.get("/", multiProtect(["super admin", "admin"]), getSchoolSettings);
router.put("/", multiProtect(["super admin"]), updateSchoolSettings);

module.exports = router;