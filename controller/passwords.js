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
const { staffModel } = require("../models");

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

    // Find user by email first
    let user = await SuperAdmin.findOne({ emailAddress: req.body.email });
    let userType = "superadmin";

    // If not found, try staff collection
    if (!user) {
      user = await staffModel.findOne({ emailAddress: req.body.email });
      userType = "staff";
    }

    if (!user) {
      return next(new ErrorResponse('User not found', 404));
    }

    // Generate a random 4-digit OTP
    const otp = generateRandomOTP();
    cache.set(user.id, otp.toString(), 600);

    // configure the notification system.
    const message = `You are receiving this email because you have requested for a One-Time Password(OTP), which is ${otp}.`;
    const sendToEmail = user.emailAddress;

    // Send email with OTP
    const sendMessage = await sendEmail(
      sendToEmail,
      "Password reset token",
      message,
      `<p>${message}</p>`
    );

    // If email fails, still return success with the OTP for development
    if (!sendMessage.status) {
      console.log(`[DEV] OTP for ${user.emailAddress}: ${otp}`);
      return successResponse(res, 200, `OTP generated. Check server console.`);
    }

    successResponse(res, 200, "Message sent successfully! Please check your email address for the OTP");

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

    let user = await SuperAdmin.findOne({ emailAddress: req.query.email });
    if (!user) user = await staffModel.findOne({ emailAddress: req.query.email });
    if (!user) return next(new ErrorResponse('User not found', 404));
    const otp = cache.take(user.id);

    if (!otp) {
      return next(new ErrorResponse('OTP not generated or expired, please regenerate OTP', 404));
    }

    // Check if the provided OTP matches the stored OTP
    if (otp != req.body.otp) {
      return next(new ErrorResponse('Incorrect OTP!', 400));
    }

    // Update user with reset token and expiration time
    user.resetPasswordToken = otp;
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000;
    await user.save();

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

    // Find user by email
    let user = await SuperAdmin.findOne({ emailAddress: req.query.email, resetPasswordExpire: { $gt: Date.now() } });
    if (!user) user = await staffModel.findOne({ emailAddress: req.query.email, resetPasswordExpire: { $gt: Date.now() } });
    if (!user) {
      return next(new ErrorResponse('Reset token expired! Please try again later', 400));
    }
    const hashedPassword = await GeneratePassword(req.body.password);
    user.password = hashedPassword;
    user.resetPasswordToken = null;
    user.resetPasswordExpire = null;
    await user.save();
    successResponse(res, 200, "Password reset successful. Please login with your new password.");
  } catch (err) {
    console.error(err);
    return next(new ErrorResponse('Error resetting password', 500));
  }
});
