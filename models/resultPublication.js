const mongoose = require("mongoose");

// A class arm's results for one term, released to students and parents.
//
// The presence of a record means published; there is no "draft" row.
// Unpublishing deletes the record, so a class that has never been
// published and one that has been pulled back look the same to
// families — which is what we want.
const resultPublicationSchema = new mongoose.Schema(
    {
        schoolId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SuperAdmin",
            required: true,
        },
        classArm: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ClassArm",
            required: true,
        },
        term: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Term",
            required: true,
        },
        session: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Session",
            required: true,
        },
        publishedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Staff",
        },
        publishedAt: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: true }
);

resultPublicationSchema.index(
    { schoolId: 1, classArm: 1, term: 1, session: 1 },
    { unique: true }
);

module.exports = mongoose.model("ResultPublication", resultPublicationSchema);