const express = require("express");
const {
    markStaffAttendance,
    getStaffAttendance,
    getSingleStaffAttendance,
    updateStaffAttendance,
} = require("../controller/staffAttendance");
const multiProtect = require("../middleware/multipleAuth");

const router = express.Router();

router.post("/mark", multiProtect(["super admin", "admin"]), markStaffAttendance);
router.get("/", multiProtect(["super admin", "admin"]), getStaffAttendance);
router.get("/staff/:staffId", multiProtect(["super admin", "admin"]), getSingleStaffAttendance);
router.put("/:id", multiProtect(["super admin", "admin"]), updateStaffAttendance);

module.exports = router;