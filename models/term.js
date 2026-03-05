const mongoose = require("mongoose");

const termSchema = new mongoose.Schema({
    termName: String,
    termStartDate: Date,
    termEndDate: Date,
    nextTermStartDate: Date,
    currentTerm: {
        type: Boolean,
        default: false
    },
    sessionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Session"
    },
    schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SuperAdmin"
    }
}, { timestamps: true });

const termModel = mongoose.model('Term', termSchema);
module.exports = termModel;