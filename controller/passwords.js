// middlewares
const {
  validateForgotPassword,
  validateVerifyOTP,
  validateResetPassword
} = require("../middleware/validation");
const { asyncHandler } = require("../middleware");

// utils
const sendEmail = require("../utils/sendgrid");
const { GeneratePassword } = require("../utils/index");
const { sendTokenResponse } = require("../utils/sendResponseToken");
const { generateRandomOTP } = require('../utils/generateRandomOTP');
const ErrorResponse = require("../utils/errorResponse");
const { successResponse } = require("../utils/successResponse")

// models
const SuperAdmin = require("../models/superAdmin");

const NodeCache = require('node-cache');
const cache = new NodeCache();

// ============================ FORGOT PASSWORD ========================================
exports.forgotPassword = asyncHandler(async (req, res, next) => {
  try {
    // Validate request body
    const { error } = validateForgotPassword(req.body);

    if (error) {
      return next(new ErrorResponse(error.details[0].message, 400));
    }

    // Find super admin by email
    const superAdmin = await SuperAdmin.findOne({ emailAddress: req.body.email });

    if (!superAdmin) {
      return next(new ErrorResponse('User not found', 404));
    }

    // Generate a random 4-digit OTP
    const otp = generateRandomOTP();

    // Set the user id as the key for the OTP in the cache
    cache.set(superAdmin.id, otp.toString(), 600); // Expires in 10 minutes (600 seconds)

    // configure the notification system.
    const message = `You are receiving this email because you have requested for a One-Time Password(OTP), which is ${otp}.`;
    const sendToEmail = superAdmin.emailAddress;

    // Send email with OTP
    const sendMessage = await sendEmail(
      sendToEmail,
      "Password reset token",
      message,
      `<p>${message}</p>`
    );

    if (!sendMessage.status) {
      return next(new ErrorResponse(sendMessage.message, 400));
    }

    successResponse(res, 200, "Message sent successfully!. Please check your email address for the OTP");
  } catch (err) {
    console.error(err);
    return next(new ErrorResponse("Email could not be sent", 500));
  }
});

// ============================ VERIFY OTP ========================================


exports.verifyOTP = asyncHandler(async (req, res, next) => {
  try {
    // validate request body
    const { error } = validateVerifyOTP(req.body);

    if (error) {
      return next(new ErrorResponse(error.details[0].message, 400));
    }

    // Validate query parameters
    if (!req.query || !req.query.email) {
      return next(new ErrorResponse('No email detected! It should be sent as a query param', 404));
    }

    // Find super admin by email
    const superAdmin = await SuperAdmin.findOne({ emailAddress: req.query.email });

    // Retrieve OTP from cache
    const otp = cache.take(superAdmin.id);

    if (!otp) {
      return next(new ErrorResponse('OTP not generated or expired, please regenerate OTP', 404));
    }

    // Check if the provided OTP matches the stored OTP
    if (otp != req.body.otp) {
      return next(new ErrorResponse('Incorrect OTP!', 400));
    }

    // Update super admin with reset token and expiration time
    superAdmin.resetPasswordToken = otp;
    superAdmin.resetPasswordExpire = Date.now() + 10 * 60 * 1000;
    await superAdmin.save();

    successResponse(res, 200, "Please proceed to resetting your password.")
  } catch (err) {
    console.error(err);
    return next(new ErrorResponse('Error verifying OTP', 500));
  }
});

// -------------------------------------- RESET PASSWORD ======================================

exports.resetPassword = asyncHandler(async (req, res, next) => {
  try {
    // Validate request body
    const { error } = validateResetPassword(req.body);

    if (error) {
      return next(new ErrorResponse(error.details[0].message, 400));
    }

    // Validate query parameters
    if (!req.query || !req.query.email) {
      return next(new ErrorResponse('No email detected! It should be sent as a query param', 404));
    }

    // Find super admin by email
    const superAdmin = await SuperAdmin.findOne({ emailAddress: req.query.email, resetPasswordExpire: { $gt: Date.now() } });

    if (!superAdmin) {
      return next(new ErrorResponse('Reset token expired! Please try again later', 400));
    }

    // Hash and update the password, reset token, and expiration time
    const hashedPassword = await GeneratePassword(req.body.password);

    superAdmin.password = hashedPassword;
    superAdmin.resetPasswordToken = null;
    superAdmin.resetPasswordExpire = null;

    // Save the updated super admin
    await superAdmin.save();

    // Send token response
    sendTokenResponse(superAdmin.id, 200, res);
  } catch (err) {
    console.error(err);
    return next(new ErrorResponse('Error resetting password', 500));
  }
});
