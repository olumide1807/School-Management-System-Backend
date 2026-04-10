const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema({
    studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Student",
        required: true
    },
    feeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Fee",
        required: true
    },
    schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SuperAdmin",
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    paymentMethod: {
        type: String,
        enum: ["cash", "bank transfer", "card", "other"],
        default: "cash"
    },
    reference: String,
    note: String,
    receivedBy: String,
    paymentDate: {
        type: Date,
        default: Date.now
    },
}, { timestamps: true });

module.exports = mongoose.model("Payment", paymentSchema);
