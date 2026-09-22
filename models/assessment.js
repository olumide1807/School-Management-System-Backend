const mongoose = require('mongoose');

const assessmentSchema = new mongoose.Schema({
    assessments: [
        {
            name: String,
            maxScore: Number,
            order: Number,
            source: {
                type: String,
                enum: ["manual", "attendance"],
                default: "manual"
            }
        }
    ],
    classLevel: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ClassLevel',
        required: true
    },
    schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SuperAdmin',
        required: true
    }
}, { timestamps: true });

assessmentSchema.index({ schoolId: 1, classLevel: 1 }, { unique: true });

const Assessment = mongoose.model('Assessment', assessmentSchema);

module.exports = Assessment;