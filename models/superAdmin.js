const mongoose = require("mongoose");
const crypto = require("crypto");

const addressSchema = new mongoose.Schema({
  number: Number,
  street: String,
  city: String,
  state: String,
  postalCode: String,
  country: String,
});

const superAdminSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
    },
    lastName: {
      type: String,
      required: true
    },
    emailAddress: {
      type: String,
      required: true,
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
    password: {
      type: String,
      validate: {
        validator: function (value) {
          // Check if the password has more than 6 characters
          return value.length > 6;
        },
        message: "Password must have more than 6 characters",
      },
    },
    phoneNumber: {
      type: String,
      required: true,
    },
    schoolName: {
      type: String,
      required: true,
      validate: {
        validator: function (value) {
          // Check if the school name has more than 3 characters
          return value.length > 3;
        },
        message: "School name must have more than 3 characters",
      },
    },
    schoolMotto: {
      type: String,
      validate: {
        validator: function (value) {
          // Check if the motto has more than 10 characters
          return value.length > 10;
        },
        message: "Motto must have more than 10 characters",
      },
    },
    schoolLogo: {
      type: String,
      default: null,
    },
    schoolEmailAddress: {
      type: String,
      unique: true,
      required: true,
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
    schoolAddress: {
      type: addressSchema,
      required: true,
    },
    schoolInitials: {
      type: String,
    },
    schoolAccountDetails: {
      accountNumber: String,
      accountName: String,
      bankName: String,
      phoneNumber: String
    },
    isRegistrationOpen: {
      type: Boolean,
      default: false,
    },
    resetPasswordToken: {
      type: String,
      default: null,
    },
    resetPasswordExpire: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

const SuperAdmin = mongoose.model("SuperAdmin", superAdminSchema);

module.exports = SuperAdmin;
