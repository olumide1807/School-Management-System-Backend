const express = require("express");
const router = express.Router();
const multiProtect = require("../middleware/multipleAuth");

const {
    getPeriodSettings,
    savePeriodSettings,
    getTimetableGrid,
    saveTimetableGrid,
    deleteTimetableGrid,
} = require("../controller/timetableGrid");

// Period Settings
router.get("/settings", multiProtect(["super admin", "admin"]), getPeriodSettings);
router.put("/settings", multiProtect(["super admin"]), savePeriodSettings);

// Timetable Grid
router.get("/grid/:classArmId", multiProtect(["super admin", "admin", "academic"]), getTimetableGrid);
router.put("/grid/:classArmId", multiProtect(["super admin", "admin"]), saveTimetableGrid);
router.delete("/grid/:classArmId", multiProtect(["super admin"]), deleteTimetableGrid);

module.exports = router;