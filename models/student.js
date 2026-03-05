const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
    number: Number,
    street: String,
    city: String,
    state: String,
    postalCode: String,
    country: String
});

const studentSchema = new mongoose.Schema({
    studentID: {
        type: String,
        required: true,
        unique: true
    },
    firstName: {
        type: String,
        required: true
    },
    surName: {
        type: String,
        required: true
    },
    otherName: {
        type: String,
    },
    email: {
        type: String,
    },
    classArmId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ClassArm',
        required: true
    },
    gender: {
        type: String,
        enum: ['male', 'female', 'other'],
        required: true
    },
    dateOfBirth: {
        type: Date,
        required: true
    },
    phoneNumber: {
        type: String
    },
    country: {
        type: String,
        required: true
    },
    photo: String, // You can store the photo URL or file path here
    guardians: [
        {
            parentId: {type: mongoose.Schema.Types.ObjectId, ref: "Parent"},
            relationship: {
                type: String
            }
        }
    ],
    bloodGroup: String,
    stateOfOrigin: {
        type: String,
        required: true
    },
    localGovernmentArea: {
        type: String,
        required: true
    },
    address: {
        type: addressSchema,
        required: true
    },
    password: {
        type: String,
        required: true
    },
    status: {
        type: "String",
        enum: ["active", "deactivated"],
        required: true,
        default: "active"
    },
    schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SuperAdmin"
    },
    resetPasswordToken: String,
    resetPasswordExpire: Date,
}, {timestamps: true});

const Student = mongoose.model('Student', studentSchema);

module.exports = Student;
