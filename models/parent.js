const mongoose = require('mongoose');
const addressSchema = require('./addressSchema');

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
            validator: function (value) {
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
    // Same shape as a student's address. Optional, unlike on students:
    // parents created before this field existed have none, and requiring
    // it would make every save() on them (e.g. a password reset) fail.
    address: addressSchema,
    country: String,
    // Optional for the same reason as address; defined as on staff
    stateOfOrigin: String,
    localGovernmentArea: String,
    schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SuperAdmin"
    },
    isLinked: {
        type: Boolean,
        default: false
    },
    password: { type: String, select: false },
    mustChangePassword: { type: Boolean, default: true },
    // A reset token is a credential: never returned unless a query asks
    // for it with .select("+resetPasswordToken +resetPasswordExpire")
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpire: { type: Date, select: false },
}, { timestamps: true });

const Parent = mongoose.model('Parent', parentSchema);

module.exports = Parent;
