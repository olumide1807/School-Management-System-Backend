const mongoose = require("mongoose");

const breakSchema = new mongoose.Schema({
    name: { type: String, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
});

const periodSettingsSchema = new mongoose.Schema(
    {
        schoolId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SuperAdmin",
            required: true,
            unique: true,
        },
        startTime: {
            type: String,
            required: true,
            default: "08:00",
        },
        endTime: {
            type: String,
            required: true,
            default: "14:00",
        },
        periodDuration: {
            type: Number,
            required: true,
            default: 40, // minutes
        },
        breaks: [breakSchema],
    },
    { timestamps: true }
);

module.exports = mongoose.model("PeriodSettings", periodSettingsSchema);