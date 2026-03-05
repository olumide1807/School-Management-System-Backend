const mongoose = require("mongoose");

const classLevelSchema = new mongoose.Schema({
    levelName: String,
    levelShortName: String,
    schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SuperAdmin"
    }
}, { timestamps: true });   

module.exports = mongoose.model('ClassLevel', classLevelSchema);
