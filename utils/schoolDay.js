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

// Does this entry close the school? The one place a calendar entry is read
// as closing or not — every reader of an entry in memory goes through it,
// and it gives the same answer as the CLOSES_SCHOOL query: only an explicit
// `false` is open. Absent (an entry written before the field existed, or
// around the model) is closed. That fails safe: a closed day that should
// have been open costs a register that can be taken later; an open day
// that should have been closed invents absences nobody can take back.
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

// The one rule for changing a calendar entry: a closed day that has started
// (today or earlier) can't be reopened. No register was asked for on it and
// one can't be taken now — today's students would be auto-marked absent at
// closing time, and past days would join attendance with no register.
//
// `next` is what the entry becomes: { startDate, endDate, closesSchool },
// or null when it's being deleted. Returns the started weekdays this entry
// closes now that would be open afterwards, earliest first ([] = allowed).
// A day another closing entry still covers isn't reopened, so removing a
// duplicate is fine. "Today" is toDayStart(now), the auto-marker's day.
const findReopenedDays = async (schoolId, entry, next, now = new Date()) => {
    if (!closesSchool(entry)) return [];
    const today = toDayStart(now);
    const from = toDayStart(entry.startDate);
    const to = new Date(Math.min(toDayStart(entry.endDate).getTime(), today.getTime()));
    if (from > to) return []; // hasn't started

    const stillClosed = (day) =>
        next && closesSchool(next) &&
        toDayStart(next.startDate) <= day && day <= toDayStart(next.endDate || next.startDate);

    const candidates = [];
    for (let d = new Date(from); d <= to; d = new Date(d.getTime() + 86400000)) {
        if (!isWeekend(d) && !stillClosed(d)) candidates.push(d);
    }
    if (candidates.length === 0) return [];

    const others = await schoolCalendarModel.find({
        schoolId,
        _id: { $ne: entry._id },
        startDate: { $lte: candidates[candidates.length - 1] },
        endDate: { $gte: candidates[0] },
        ...CLOSES_SCHOOL,
    });
    return candidates.filter(
        (d) => !others.some((o) => toDayStart(o.startDate) <= d && d <= toDayStart(o.endDate))
    );
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
    findReopenedDays,
};