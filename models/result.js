const mongoose = require('mongoose');

// Scores snapshot the assessment definition that was in force when they were
// entered. If a school changes its assessment format next year, historical
// results stay readable and old report cards stay correct.
const scoreSchema = new mongoose.Schema({
    name: { type: String, required: true },      // "CA 1"
    maxScore: { type: Number, required: true },  // 20
    score: { type: Number, required: true },     // 17
}, { _id: false });

const subjectResultSchema = new mongoose.Schema({
    subject: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject',
        required: true
    },
    specificSubject: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'specificSubject',
    },
    scores: {
        type: [scoreSchema],
        default: []
    },
    // Denormalised so report cards don't re-sum on every render
    Total: {
        type: Number,
        required: true,
        default: 0
    },
    enteredBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Staff'
    },
    enteredAt: {
        type: Date,
        default: Date.now
    }
}, { _id: false });

const resultSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SuperAdmin',
        required: true
    },
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: true
    },
    session: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Session',
        required: true
    },
    classLevel: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ClassLevel',
        required: true
    },
    classArm: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ClassArm',
        required: true
    },
    Terms: [{
        termId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Term',
            required: true
        },
        subjects: {
            type: [subjectResultSchema],
            default: []
        },
        teacherComment: { type: String, default: "" },
        principalComment: { type: String, default: "" },
    }]
}, { timestamps: true });

// One result document per student per session
resultSchema.index({ school: 1, student: 1, session: 1 }, { unique: true });

const result = mongoose.model('result', resultSchema);

module.exports = result;