const { asyncHandler } = require("../middleware");
const ErrorResponse = require("../utils/errorResponse");
const { successResponse } = require("../utils/successResponse");
const { isValidMongoId } = require("../utils/isValidMongoObjectId");
const { schoolCalendarModel, termModel } = require("../models");
const { toDayStart, isSchoolDay } = require("../utils/schoolDay");

const getSchoolId = (req) => (req.user.schoolName ? req.user.id : req.user.schoolId);

const TYPES = ["public_holiday", "school_break", "school_event", "other"];

// Fixed-date Nigerian public holidays. Moveable ones — Good Friday,
// Easter Monday, Eid al-Fitr, Eid al-Adha, Eid-el-Maulud — depend on
// the lunar calendar or government declaration and are added manually.
const FIXED_NIGERIAN_HOLIDAYS = [
    { month: 0, day: 1, name: "New Year's Day" },
    { month: 4, day: 1, name: "Workers' Day" },
    { month: 5, day: 12, name: "Democracy Day" },
    { month: 9, day: 1, name: "Independence Day" },
    { month: 11, day: 25, name: "Christmas Day" },
    { month: 11, day: 26, name: "Boxing Day" },
];

const validateEntry = ({ name, type, startDate, endDate }) => {
    if (!name || !String(name).trim()) return "A name is required";
    if (type && !TYPES.includes(type)) return "Invalid type";
    if (!startDate || Number.isNaN(new Date(startDate).getTime())) return "A valid start date is required";
    const end = endDate || startDate;
    if (Number.isNaN(new Date(end).getTime())) return "A valid end date is required";
    if (toDayStart(end) < toDayStart(startDate)) return "End date can't be before start date";
    return null;
};

// ============================================================
// CREATE — POST /calendar
// ============================================================
exports.createCalendarEntry = asyncHandler(async (req, res, next) => {
    try {
        const error = validateEntry(req.body);
        if (error) return next(new ErrorResponse(error, 400));

        const schoolId = getSchoolId(req);
        const { name, type, startDate, endDate } = req.body;

        const entry = await schoolCalendarModel.create({
            schoolId,
            name: String(name).trim(),
            type: type || "public_holiday",
            startDate: toDayStart(startDate),
            endDate: toDayStart(endDate || startDate),
        });

        successResponse(res, 201, "Added to the school calendar", entry);
    } catch (e) {
        console.error("Error creating calendar entry:", e);
        next(e);
    }
});

// ============================================================
// LIST — GET /calendar?from=&to=
// ============================================================
exports.getCalendarEntries = asyncHandler(async (req, res, next) => {
    try {
        const schoolId = getSchoolId(req);
        const { from, to } = req.query;

        const filter = { schoolId };
        // Anything overlapping the window
        if (from) filter.endDate = { $gte: toDayStart(from) };
        if (to) filter.startDate = { $lte: toDayStart(to) };

        const entries = await schoolCalendarModel.find(filter).sort({ startDate: 1 });
        successResponse(res, 200, null, entries);
    } catch (e) {
        console.error("Error getting calendar entries:", e);
        next(e);
    }
});

// ============================================================
// IS THIS A SCHOOL DAY? — GET /calendar/check?date=
// ============================================================
exports.checkDate = asyncHandler(async (req, res, next) => {
    try {
        const schoolId = getSchoolId(req);
        const date = req.query.date || new Date();

        if (Number.isNaN(new Date(date).getTime())) {
            return next(new ErrorResponse("Invalid date", 400));
        }

        const result = await isSchoolDay(schoolId, date);
        successResponse(res, 200, null, result);
    } catch (e) {
        console.error("Error checking date:", e);
        next(e);
    }
});

// ============================================================
// UPDATE — PUT /calendar/:id
// ============================================================
exports.updateCalendarEntry = asyncHandler(async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!isValidMongoId(id)) return next(new ErrorResponse("Invalid id", 400));

        const error = validateEntry(req.body);
        if (error) return next(new ErrorResponse(error, 400));

        const schoolId = getSchoolId(req);
        const entry = await schoolCalendarModel.findOne({ _id: id, schoolId });
        if (!entry) return next(new ErrorResponse("Calendar entry not found", 404));

        const { name, type, startDate, endDate } = req.body;
        entry.name = String(name).trim();
        entry.type = type || entry.type;
        entry.startDate = toDayStart(startDate);
        entry.endDate = toDayStart(endDate || startDate);
        await entry.save();

        successResponse(res, 200, "Calendar entry updated", entry);
    } catch (e) {
        console.error("Error updating calendar entry:", e);
        next(e);
    }
});

// ============================================================
// DELETE — DELETE /calendar/:id
// ============================================================
exports.deleteCalendarEntry = asyncHandler(async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!isValidMongoId(id)) return next(new ErrorResponse("Invalid id", 400));

        const schoolId = getSchoolId(req);
        const entry = await schoolCalendarModel.findOneAndDelete({ _id: id, schoolId });
        if (!entry) return next(new ErrorResponse("Calendar entry not found", 404));

        successResponse(res, 200, "Removed from the school calendar", null);
    } catch (e) {
        console.error("Error deleting calendar entry:", e);
        next(e);
    }
});

// ============================================================
// ADD FIXED NIGERIAN PUBLIC HOLIDAYS FOR A SESSION
// POST /calendar/public-holidays { sessionId }
//
// Only adds holidays falling inside one of the session's terms —
// a holiday during the long vacation needs no entry. Skips any
// date already on the calendar, so it's safe to run twice.
// ============================================================
exports.addPublicHolidays = asyncHandler(async (req, res, next) => {
    try {
        const schoolId = getSchoolId(req);
        const { sessionId } = req.body;

        if (!isValidMongoId(sessionId)) {
            return next(new ErrorResponse("Invalid session", 400));
        }

        const terms = await termModel.find({ schoolId, sessionId });
        const dated = terms.filter((t) => t.termStartDate && t.termEndDate);
        if (dated.length === 0) {
            return next(new ErrorResponse(
                "This session's terms have no dates yet — set term dates first", 400
            ));
        }

        const inAnyTerm = (day) =>
            dated.some(
                (t) => toDayStart(t.termStartDate) <= day && day <= toDayStart(t.termEndDate)
            );

        const years = new Set();
        dated.forEach((t) => {
            years.add(new Date(t.termStartDate).getUTCFullYear());
            years.add(new Date(t.termEndDate).getUTCFullYear());
        });

        const candidates = [];
        years.forEach((year) => {
            FIXED_NIGERIAN_HOLIDAYS.forEach((h) => {
                const day = new Date(Date.UTC(year, h.month, h.day));
                if (inAnyTerm(day)) candidates.push({ name: h.name, day });
            });
        });

        let added = 0;
        for (const c of candidates) {
            const exists = await schoolCalendarModel.findOne({
                schoolId,
                startDate: { $lte: c.day },
                endDate: { $gte: c.day },
            });
            if (exists) continue;

            await schoolCalendarModel.create({
                schoolId,
                name: c.name,
                type: "public_holiday",
                startDate: c.day,
                endDate: c.day,
            });
            added++;
        }

        successResponse(
            res,
            200,
            added === 0
                ? "No new public holidays fall within this session's terms"
                : `Added ${added} public holiday${added === 1 ? "" : "s"}`,
            { added }
        );
    } catch (e) {
        console.error("Error adding public holidays:", e);
        next(e);
    }
});