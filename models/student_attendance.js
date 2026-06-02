const mongoose = require("mongoose");

const studentAttendanceSchema = new mongoose.Schema({
    schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SuperAdmin",
        required: true
    },
    studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Student",
        required: true
    },
    classArmId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ClassArm",
        required: true
    },
    sessionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Session",
        required: true
    },
    termId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Term",
        required: true
    },
    date: {
        // Normalised to start-of-day (UTC) so each student has at most one record per day
        type: Date,
        required: true
    },
    status: {
        type: String,
        enum: ["present", "absent"],
        required: true
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

// Prevent duplicate records for the same student on the same day
studentAttendanceSchema.index({ studentId: 1, date: 1 }, { unique: true });
// Fast lookup for class-wide queries
studentAttendanceSchema.index({ schoolId: 1, classArmId: 1, date: 1 });

module.exports = mongoose.model("StudentAttendance", studentAttendanceSchema);