const mongoose = require("mongoose");

const schema = new mongoose.Schema({
    schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SuperAdmin",
        required: true
    },
    termId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Term",
        required: true
    },
    classArmId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ClassArm",
        required: true
    },
    currency: {
        type: String,
        required: true
    },
    fees: [
        {
            description: String,
            amount: String
        }
    ]
}, { timestamps: true });   

module.exports = mongoose.model('Fee', schema);
