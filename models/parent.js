const mongoose = require('mongoose');

const parentSchema = new mongoose.Schema({
    title: String,
    firstName: String,
    surName: String,
    gender: {
        type: String,
        enum: ["male", "female", "prefer not to say"],
        default: "prefer not to say"
    },
    maritalStatus: {
      type: String,
      enum: ["single", "married"]
    },
    email: {
        type: String,
        // Add email validation using a regular expression (regex)
        validate: {
            validator: function(value) {
                // Regular expression for a valid email address
                const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/;
                return emailRegex.test(value);
            },
            message: 'Invalid email address'
        }
    },
    phoneNumber: {
        type: String,
        required: true
    },
    occupation: {
        type: String,
        required: true
    },
    homeAddress: String,
    schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SuperAdmin"
    },
    isLinked: {
        type: Boolean,
        default: false
    },
    resetPasswordToken: String,
      resetPasswordExpire: Date,
}, { timestamps: true });

const Parent = mongoose.model('Parent', parentSchema);

module.exports = Parent;
