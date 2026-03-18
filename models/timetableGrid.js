const mongoose = require("mongoose");

const timetableGridSchema = new mongoose.Schema(
    {
        classArmId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ClassArm",
            required: true,
        },
        schoolId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SuperAdmin",
            required: true,
        },
        type: {
            type: String,
            enum: ["class", "exam", "test"],
            default: "class",
        },
        // Grid data: { "monday": { "1": { subjectId, subjectName }, "2": {...} }, "tuesday": {...} }
        grid: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
    },
    { timestamps: true }
);

// One timetable per class arm per type
timetableGridSchema.index({ classArmId: 1, schoolId: 1, type: 1 }, { unique: true });

module.exports = mongoose.model("TimetableGrid", timetableGridSchema);