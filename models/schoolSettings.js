const mongoose = require("mongoose");

const gradingScaleSchema = new mongoose.Schema({
    grade: { type: String, required: true },       // A, B, C, D, E, F
    minScore: { type: Number, required: true },     // 70
    maxScore: { type: Number, required: true },     // 100
    remark: { type: String, default: "" },          // Excellent
});

const schoolSettingsSchema = new mongoose.Schema({
    schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SuperAdmin",
        required: true,
        unique: true,
    },

    // Notification preferences
    notifications: {
        emailOnStudentRegistration: { type: Boolean, default: true },
        emailOnFeePayment: { type: Boolean, default: true },
        emailOnStaffAdded: { type: Boolean, default: true },
        emailOnAttendanceMarked: { type: Boolean, default: false },
        emailOnPasswordReset: { type: Boolean, default: true },
    },

    // Registration control
    registrationOpen: { type: Boolean, default: true },

    // Fee defaults
    feeDefaults: {
        currency: { type: String, default: "NGN" },
        platformFeeAmount: { type: Number, default: 2000 },
        platformFeeDescription: { type: String, default: "Platform Fee (Basitech)" },
    },

    // ID format
    studentIdPrefix: { type: String, default: "" },
    staffIdPrefix: { type: String, default: "" },

    // Grading scale
    gradingScale: {
        type: [gradingScaleSchema],
        default: [
            { grade: "A", minScore: 70, maxScore: 100, remark: "Excellent" },
            { grade: "B", minScore: 60, maxScore: 69, remark: "Very Good" },
            { grade: "C", minScore: 50, maxScore: 59, remark: "Good" },
            { grade: "D", minScore: 40, maxScore: 49, remark: "Fair" },
            { grade: "E", minScore: 30, maxScore: 39, remark: "Poor" },
            { grade: "F", minScore: 0, maxScore: 29, remark: "Fail" },
        ],
    },
}, { timestamps: true });

module.exports = mongoose.model("SchoolSettings", schoolSettingsSchema);