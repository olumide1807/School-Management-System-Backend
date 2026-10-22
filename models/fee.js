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
            // In major units (naira). Validated on the way in by
            // utils/feeAmount.js: zero or more, at most two decimals.
            amount: { type: Number, required: true, min: 0 }
        }
    ]
}, { timestamps: true });   

module.exports = mongoose.model('Fee', schema);
