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
    // ===== PERSONAL INFO =====
    firstName: { type: String, required: true },
    surName: { type: String, required: true },
    otherName: String,
    email: String,
    gender: { type: String, enum: ['male', 'female', 'other'], required: true },
    dateOfBirth: { type: Date, required: true },
    photo: String,
    bloodGroup: String,
    religion: String,
    nationality: { type: String, default: "Nigerian" },

    // ===== CONTACT INFO =====
    phoneNumber: String,
    country: { type: String, required: true },
    stateOfOrigin: { type: String, required: true },
    localGovernmentArea: { type: String, required: true },
    address: { type: addressSchema, required: true },

    // ===== ACADEMIC INFO =====
    classArmId: { type: mongoose.Schema.Types.ObjectId, ref: 'ClassArm', required: true },
    admissionDate: { type: Date, default: Date.now },
    previousSchool: String,
    lastClassAttended: String,
    reasonForLeaving: String,

    // ===== PARENT/GUARDIAN =====
    guardians: [{
        parentId: { type: mongoose.Schema.Types.ObjectId, ref: "Parent" },
        relationship: String
    }],

    // ===== MEDICAL INFO =====
    medicalInfo: {
        allergies: String,
        disabilities: String,
        medicalConditions: String,
    },

    // ===== EMERGENCY CONTACT =====
    emergencyContact: {
        name: String,
        phone: String,
        relationship: String,
    },

    // ===== SYSTEM =====
    password: { type: String, required: true },
    status: { type: String, enum: ["active", "deactivated"], required: true, default: "active" },
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "SuperAdmin" },
    resetPasswordToken: String,
    resetPasswordExpire: Date,
}, { timestamps: true });

const Student = mongoose.model('Student', studentSchema);
module.exports = Student;