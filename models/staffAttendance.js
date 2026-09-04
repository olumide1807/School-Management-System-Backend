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
        // Normalised to start-of-day UTC
        type: Date,
        required: true
    },
    status: {
        type: String,
        enum: ["present", "absent", "late", "on_leave"],
        required: true
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

// One record per staff per day
staffAttendanceSchema.index({ staffId: 1, date: 1 }, { unique: true });
// Fast lookup for school-wide queries
staffAttendanceSchema.index({ schoolId: 1, date: 1 });

module.exports = mongoose.model("StaffAttendance", staffAttendanceSchema);