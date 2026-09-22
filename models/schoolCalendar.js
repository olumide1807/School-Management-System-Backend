const mongoose = require("mongoose");

// A day or range of days when the school is closed.
// A single holiday has startDate === endDate.
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
    },
    { timestamps: true }
);

schoolCalendarSchema.index({ schoolId: 1, startDate: 1, endDate: 1 });

module.exports = mongoose.model("SchoolCalendar", schoolCalendarSchema);