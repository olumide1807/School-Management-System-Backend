const mongoose = require("mongoose");

const staffAttendanceSchema = new mongoose.Schema({
    schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SuperAdmin",
        required: true
    },
    staffId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Staff",
        required: true
    },
    date: {
        type: Date,
        required: true
    },
    status: {
        type: String,
        enum: ["present", "absent", "late", "on_leave"],
        required: true
    },
    checkInTime: {
        // "HH:MM" 24-hour format e.g. "08:45"
        // Only set when status is "present" or "late"
        // System auto-derives present vs late based on school start time + grace period
        type: String,
        default: null
    },
    note: {
        type: String,
        default: ""
    },
    recordedBy: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    recordedByName: {
        type: String,
        default: ""
    }
}, { timestamps: true });

staffAttendanceSchema.index({ staffId: 1, date: 1 }, { unique: true });
staffAttendanceSchema.index({ schoolId: 1, date: 1 });

module.exports = mongoose.model("StaffAttendance", staffAttendanceSchema);