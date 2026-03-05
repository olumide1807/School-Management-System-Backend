const mongoose = require("mongoose");

const periodSchema = new mongoose.Schema(
    {
        startTimeOfTheDay: {
            type: String,
            required: true,
        },
        endTimeOfTheDay: {
            type: String,
            required: true,
        },
        periodInterval: {
            type: Number,
            required: true,
            enum: [30, 60, 45, 50, 60, 90],
        },
        day: [
            {
                type: String,
                enum: ["monday", "tuesday", "wednesday", "thursday", "friday"],
            },
        ],
        classArmDisplayNames: [
            {
                type: String,
                required: true,
            },
        ],
        schoolId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SuperAdmin",
        },
        type: {
            type: String,
            enum: ["class", "test", "exam"],
            default: "class"
        }
    },
    {timestamps: true}
);

module.exports = mongoose.model("PeriodTime", periodSchema);
