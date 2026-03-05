const mongoose = require('mongoose');

const assessmentSchema = new mongoose.Schema({
    assessments: [
        {
            name: String,
            score: String
        }
    ],
    schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SuperAdmin'
    }
}, { timestamps: true });

const Announcement = mongoose.model('Assessment', assessmentSchema);

module.exports = Announcement;
