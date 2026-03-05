const mongoose = require("mongoose");

const specificSubjectSchema = new mongoose.Schema(
  {
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
    },
    classArmId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ClassArm",
    },
    subjectTeacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
    },
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SuperAdmin",
    },
    subjectCode: {
        type: String,
        default: null
    }
  },
  { timestamps: true }
);

const SubjectModel = mongoose.model("SpecificSubject", specificSubjectSchema);

module.exports = SubjectModel;
