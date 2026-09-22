const { schoolCalendarModel } = require("../models");

// Normalise to start-of-day UTC — identical to controller/attendance.js,
// so calendar entries and attendance records line up exactly.
const toDayStart = (d) => {
    const date = new Date(d);
    date.setUTCHours(0, 0, 0, 0);
    return date;
};

const isWeekend = (d) => {
    const day = new Date(d).getDay();
    return day === 0 || day === 6;
};

// Returns the calendar entry covering this date, or null if school is open.
const findClosure = async (schoolId, date) => {
    const day = toDayStart(date);
    return schoolCalendarModel.findOne({
        schoolId,
        startDate: { $lte: day },
        endDate: { $gte: day },
    });
};

// Single answer to "is this a school day?" — used by attendance guards
// and the auto-mark scheduler. Term boundaries are checked separately
// by the callers, since they already resolve the term for other reasons.
const isSchoolDay = async (schoolId, date) => {
    if (isWeekend(date)) return { open: false, reason: "weekend", closure: null };
    const closure = await findClosure(schoolId, date);
    if (closure) return { open: false, reason: "closure", closure };
    return { open: true, reason: null, closure: null };
};

module.exports = { toDayStart, isWeekend, findClosure, isSchoolDay };