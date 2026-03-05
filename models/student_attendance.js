const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
    studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: true
    },
    schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SuperAdmin',
        required: true
    },

    classArmId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ClassArm',
        required: true
    },
    term: {
        type: String,
        enum: ['first', 'second', 'third'],
        required: true
    },
    sessionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Session',
        required: true
    },
    status: {
        type: Boolean,
        required: true,
        default: true
    },
    date: {
        type: Date,
        default: Date.now()
    }
    }, { timestamps: true }
);

const Attendance = mongoose.model('StudentAttendance', attendanceSchema);

module.exports = Attendance;
