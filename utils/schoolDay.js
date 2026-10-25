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

// Whether an entry closes the school is closesSchool, never the type. An
// entry without the field (one written before it existed and not yet
// migrated) counts as closing, as every entry did then — so a missing
// value can never turn a closed day into an open one.
const CLOSES_SCHOOL = { closesSchool: { $ne: false } };

// Returns the closing calendar entry covering this date, or null if school
// is open. An entry that doesn't close the school (a sports day) is ignored.
const findClosure = async (schoolId, date) => {
    const day = toDayStart(date);
    return schoolCalendarModel.findOne({
        schoolId,
        startDate: { $lte: day },
        endDate: { $gte: day },
        ...CLOSES_SCHOOL,
    });
};

// Every closing entry overlapping [from, to], earliest first — exactly the
// days the auto-marker and the register treat as closed.
const findClosuresBetween = async (schoolId, from, to) =>
    schoolCalendarModel
        .find({
            schoolId,
            startDate: { $lte: toDayStart(to) },
            endDate: { $gte: toDayStart(from) },
            ...CLOSES_SCHOOL,
        })
        .sort({ startDate: 1 });

// Every entry overlapping [from, to], closing or not, earliest first — for
// showing the calendar. Use findClosure/findClosuresBetween to decide
// whether school is open.
const findCalendarEntriesBetween = async (schoolId, from, to) =>
    schoolCalendarModel
        .find({
            schoolId,
            startDate: { $lte: toDayStart(to) },
            endDate: { $gte: toDayStart(from) },
        })
        .sort({ startDate: 1 });

// The one place a stored entry is read as closing or not
const closesSchool = (entry) => entry?.closesSchool !== false;

// Single answer to "is this a school day?" — used by attendance guards
// and the auto-mark scheduler. Term boundaries are checked separately
// by the callers, since they already resolve the term for other reasons.
const isSchoolDay = async (schoolId, date) => {
    if (isWeekend(date)) return { open: false, reason: "weekend", closure: null };
    const closure = await findClosure(schoolId, date);
    if (closure) return { open: false, reason: "closure", closure };
    return { open: true, reason: null, closure: null };
};

module.exports = {
    toDayStart,
    isWeekend,
    findClosure,
    findClosuresBetween,
    findCalendarEntriesBetween,
    closesSchool,
    CLOSES_SCHOOL,
    isSchoolDay,
};