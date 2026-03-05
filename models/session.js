const mongoose = require('mongoose');


// sessionSchema 
const sessionSchema = new mongoose.Schema({
    sessionName: String,
    schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SuperAdmin"
    },
    currentSession: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });




// sessionSchema
const SessionModel = mongoose.model('Session', sessionSchema);
module.exports = SessionModel