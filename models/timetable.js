const mongoose = require("mongoose");

const timetableSchema = new mongoose.Schema(
    {
        type: {
            type: String,
            enum: ["exam", "class", "test"],
            default: "class",
        },
        classArmId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ClassArm",
            required: true
        },
        file: {
            type: String,
            required: true,
            default: null
        },
        schoolId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SuperAdmin",
            required: true,
        }
    },
    {timestamps: true}
);

module.exports = mongoose.model("Timetable", timetableSchema);
