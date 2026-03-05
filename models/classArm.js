const mongoose = require("mongoose");

const classArmSchema = new mongoose.Schema({
    armName: String,
    assignedTeacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Staff"
    },
    classLevelId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ClassLevel"
    },
    schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SuperAdmin"
    }
}, { timestamps: true });

module.exports = mongoose.model('ClassArm', classArmSchema);