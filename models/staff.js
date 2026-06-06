const mongoose = require("mongoose");

const staffSchema = new mongoose.Schema(
  {
    title: String,
    firstName: String,
    surname: String,
    otherName: String,
    profilePicture: String,
    gender: {
      type: String,
      enum: ["male", "female", "prefer not to say"],
      default: "prefer not to say"
    },
    maritalStatus: {
      type: String,
      enum: ["single", "married"]
    },
    emailAddress: {
      type: String,
      unique: true,
      // Add email validation using a regular expression (regex)
      validate: {
        validator: function (value) {
          // Regular expression for a valid email address
          const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/;
          return emailRegex.test(value);
        },
        message: "Invalid email address",
      },
    },
    phoneNumber: String,
    country: String,
    stateOfOrigin: String,
    localGovernmentArea: String,
    religion: String,
    nextOfKinFirstName: String,
    nextOfKinSurname: String,
    nextOfKinPhoneNumber: String,
    nextOfKinRelationship: String,
    homeAddress: String,
    staffType: {
      type: String,
      enum: ["academic", "non-academic"],
      default: "academic"
    },
    salary: String,
    employmentDate: Date,
    isAdmin: {
      type: Boolean,
      default: false
    },
    password: String,
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SuperAdmin",
    },
    resetPasswordToken: String,
    resetPasswordExpire: Date,
    staffID: {
      type: String,
      unique: true,
      sparse: true
    },
    qualifications: [{
      degree: String,
      fieldOfStudy: String,
      institution: String,
      yearGraduated: Number,
      certificateUrl: String
    }],
    isActive: {
      type: Boolean,
      default: true
    },
    deactivatedAt: {
      type: Date,
      default: null
    },
  },
  { timestamps: true }
);

const Staff = mongoose.model("Staff", staffSchema);

module.exports = Staff;
