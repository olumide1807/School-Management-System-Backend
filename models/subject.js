const mongoose = require("mongoose");

const subjectSchema = new mongoose.Schema({
    subjectName: String,
    schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SuperAdmin"
    }
}, { timestamps: true });   

const SubjectModel = mongoose.model('Subject', subjectSchema);

module.exports = SubjectModel;
