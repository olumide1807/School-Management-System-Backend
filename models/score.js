const mongoose = require("mongoose");

const scoreSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
    },
    classArm: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ClassArm",
      required: true,
    },
    score: [
      {
        achievable: Number,
        achieved: Number,
        tag: String,
      },
    ],
  },
  { timestamps: true }
);

const ScoreSchema = mongoose.model("Score", scoreSchema);

module.exports = ScoreSchema;
