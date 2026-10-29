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

const crypto = require("crypto");
const NodeCache = require('node-cache');
const cache = new NodeCache();

// Reset tokens are stored hashed: the database never holds one that works
const sha256 = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
const RESET_TOKEN_MINUTES = 15;

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

    // Check if the provided OTP matches the stored OTP. The OTP has already
    // been taken from the cache, so it can't be tried again either way.
    if (otp != req.body.otp) {
      return next(new ErrorResponse('Incorrect OTP!', 400));
    }

    // The OTP is spent. In its place, a single-use reset token: random,
    // returned only to whoever verified, stored only as a hash, and short-
    // lived. resetPassword accepts that token and nothing else, so knowing
    // the email isn't enough to walk into someone else's reset.
    const resetToken = crypto.randomBytes(32).toString("hex");
    await user.constructor.updateOne(
      { _id: user._id },
      { $set: { resetPasswordToken: sha256(resetToken), resetPasswordExpire: new Date(Date.now() + RESET_TOKEN_MINUTES * 60 * 1000) } }
    );

    successResponse(res, 200, "Please proceed to resetting your password.", {
      resetToken,
      expiresInMinutes: RESET_TOKEN_MINUTES,
    });
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

    // The token from verifyOTP is the only thing that identifies the
    // account. Setting the password and clearing the token is one atomic
    // update, so a token works exactly once — two requests racing with it
    // can't both succeed — and an expired one never matches.
    const hashedPassword = await GeneratePassword(req.body.password);
    const consume = {
      $set: { password: hashedPassword, resetPasswordToken: null, resetPasswordExpire: null },
    };
    const match = { resetPasswordToken: sha256(req.body.token), resetPasswordExpire: { $gt: new Date() } };
    const user =
      (await SuperAdmin.findOneAndUpdate(match, consume)) ||
      (await staffModel.findOneAndUpdate(match, consume));
    if (!user) {
      // Wrong, already used or expired: the same answer for each
      return next(new ErrorResponse('This reset link has expired or has already been used. Request a new code to start again.', 400));
    }
    successResponse(res, 200, "Password reset successful. Please login with your new password.");
  } catch (err) {
    console.error(err);
    return next(new ErrorResponse('Error resetting password', 500));
  }
});
