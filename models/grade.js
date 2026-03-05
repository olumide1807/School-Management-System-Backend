const mongoose = require('mongoose');

const gradeSchema = new mongoose.Schema({
    schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SuperAdmin",
        required: true
    },
    name: String,
    grades: [
        {
            "scoreRange": {
                "from": Number,
                "to": Number
            },
            "grade": String,
            "remark": String,
            "color": String
        }
    ]
})


const gradeModel = mongoose.model("grade", gradeSchema)

module.exports = gradeModel