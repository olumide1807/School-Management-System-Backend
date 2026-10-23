const mongoose = require("mongoose");

// Nigerian account number (NUBAN): exactly 10 digits
const NUBAN = /^\d{10}$/;

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

    // Attendance Settings
    attendanceSettings: {
        schoolStartTime: { type: String, default: "08:00" },  // "HH:MM" 24hr
        gracePeriodMinutes: { type: Number, default: 15 },    // minutes after start = still "present"
    },

    // Registration control
    registrationOpen: { type: Boolean, default: true },

    // Fee defaults
    feeDefaults: {
        currency: { type: String, default: "NGN" },
        platformFeeAmount: { type: Number, default: 2000 },
        platformFeeDescription: { type: String, default: "Platform Fee (Basitech)" },
    },

    // Where families pay fees, shown on the parent fees page. All optional:
    // a school that hasn't filled these in shows "ask the school office".
    bankDetails: {
        bankName: { type: String, trim: true, default: "" },
        accountName: { type: String, trim: true, default: "" },
        // NUBAN: exactly 10 digits. A String, never a Number, so a leading
        // zero survives. Empty means not set.
        accountNumber: {
            type: String,
            trim: true,
            default: "",
            validate: {
                validator: (v) => v === "" || v == null || NUBAN.test(v),
                message: "Account number must be exactly 10 digits",
            },
        },
        // Anything specific to this school, e.g. "Pay at the bursary on
        // Fridays" or "Use the child's class in the narration"
        paymentInstructions: { type: String, trim: true, default: "" },
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

    // The staff member who signs report cards. Admin access comes from
    // their isAdmin flag — this only records who the principal is.
    principalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Staff",
        default: null,
    },

        // Default report card comments, chosen by the student's average.
    // A teacher or principal can override any individual comment.
    reportComments: {
        teacher: {
            type: [{ from: Number, to: Number, text: String }],
            default: [
                { from: 75, to: 100, text: "An excellent result. Keep it up." },
                { from: 60, to: 74, text: "A good result. You can do even better." },
                { from: 45, to: 59, text: "A fair result. More effort is needed." },
                { from: 0, to: 44, text: "A weak result. Please see me." },
            ],
        },
        principal: {
            type: [{ from: Number, to: Number, text: String }],
            default: [
                { from: 75, to: 100, text: "An outstanding performance. Well done." },
                { from: 60, to: 74, text: "A commendable result. Keep working hard." },
                { from: 45, to: 59, text: "An average result. Improvement is expected." },
                { from: 0, to: 44, text: "A poor result. Parents should see the principal." },
            ],
        },
    },
}, { timestamps: true });

module.exports = mongoose.model("SchoolSettings", schoolSettingsSchema);
module.exports.NUBAN = NUBAN;