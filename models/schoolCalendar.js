const mongoose = require("mongoose");

// For a NEW entry with no explicit choice: holidays, breaks and other
// closures close the school; a school event doesn't. Existing entries were
// all migrated to true, the behaviour they had before this field existed.
const defaultClosesSchool = (type) => type !== "school_event";

// A day or range of days on the school calendar. A single day has
// startDate === endDate.
//
// closesSchool decides whether the school is closed on those days — no
// register, no auto-marked absences, not counted in attendance. The type
// can't decide it: a staff training day ("other") closes the school, a
// sports day ("school_event") usually doesn't. It's always stored
// explicitly; new entries default by type (see defaultClosesSchool).
// Dates are stored as UTC day-starts, matching student attendance records,
// so a calendar entry and an attendance record for the same day compare equal.
const schoolCalendarSchema = new mongoose.Schema(
    {
        schoolId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SuperAdmin",
            required: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        type: {
            type: String,
            enum: ["public_holiday", "school_break", "school_event", "other"],
            default: "public_holiday",
        },
        startDate: {
            type: Date,
            required: true,
        },
        endDate: {
            type: Date,
            required: true,
        },
        closesSchool: {
            type: Boolean,
            required: true,
            // Backstop for NEW entries only: the controller sets it
            // explicitly from the request, or from defaultClosesSchool(type).
            //
            // Never applied when a stored entry is loaded. Mongoose runs
            // defaults on hydration too, which turned a stored school event
            // with no closesSchool into `false` (open) in memory, while the
            // register's query ($ne: false) treated it as closed. Left
            // absent, it reads as closed everywhere — see closesSchool() in
            // utils/schoolDay.js, the one place it's interpreted.
            default: function () {
                return this.$isNew ? defaultClosesSchool(this.type) : undefined;
            },
        },
    },
    { timestamps: true }
);

schoolCalendarSchema.index({ schoolId: 1, startDate: 1, endDate: 1 });

module.exports = mongoose.model("SchoolCalendar", schoolCalendarSchema);
module.exports.defaultClosesSchool = defaultClosesSchool;