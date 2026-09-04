const express = require("express");
const { getSchoolSettings, updateSchoolSettings } = require("../controller/schoolSettings");
const multiProtect = require("../middleware/multipleAuth");

const router = express.Router();

router.get("/", multiProtect(["super admin", "admin"]), getSchoolSettings);
router.put("/", multiProtect(["super admin"]), updateSchoolSettings);

module.exports = router;