const mongoose = require('mongoose');

const Schema = new mongoose.Schema({
    staffId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Staff',
        required: true
    },
    sessionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Session',
        required: true
    },
    term: {
        type: String,
        required: true,
        enum: ["first", "second", "third"]
    },
    date: {
        type: Date,
        required: true,
        default: Date.now()
    },
    status: {
        type: Boolean,
        required: true
    },
    staffType: {
        type: String,
        required: true,
        enum: ["admin", "academic", "non-academic"]
    },
    schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SuperAdmin'
    }
}, { timestamps: true });

// sessionSchema
const staffAttendanceModel = mongoose.model('StaffAttendance', Schema);
module.exports = staffAttendanceModel