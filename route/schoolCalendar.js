const { Router } = require("express");
const {
    createCalendarEntry,
    getCalendarEntries,
    checkDate,
    updateCalendarEntry,
    deleteCalendarEntry,
    addPublicHolidays,
} = require("../controller/schoolCalendar");
const multipleProtect = require("../middleware/multipleAuth");

const router = Router();

const READERS = ["super admin", "admin", "academic", "non-academic"];
const WRITERS = ["super admin", "admin"];

// "/check" must come before "/:id" routes
router.get("/check", multipleProtect(READERS), checkDate);
router.get("/", multipleProtect(READERS), getCalendarEntries);

router.post("/public-holidays", multipleProtect(WRITERS), addPublicHolidays);
router.post("/", multipleProtect(WRITERS), createCalendarEntry);
router.put("/:id", multipleProtect(WRITERS), updateCalendarEntry);
router.delete("/:id", multipleProtect(WRITERS), deleteCalendarEntry);

module.exports = router;