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

// Reset tokens and OTPs are stored hashed: the database never holds one
// that works
const sha256 = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
// Salted with the account, so the same code on two accounts hashes apart
const otpHash = (userId, otp) => sha256(`${userId}:${otp}`);

const RESET_TOKEN_MINUTES = 15;

// Guessing limits, per ACCOUNT (an IP limit is sidestepped by using more
// IPs). A code is 6 digits (900,000 possibilities) and lives 10 minutes;
// 5 wrong guesses kill it; 5 codes per account per rolling 24 hours. So at
// most 25 guesses per account per day — about 1 in 36,000 a day, ~1% over
// a year of non-stop attack. The cost: someone requesting codes for your
// email can hold up your reset for a day.
const OTP_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 5;
const MAX_OTP_REQUESTS = 5;
const OTP_REQUEST_WINDOW_MS = 24 * 60 * 60 * 1000;

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

    // Issue a 6-digit code, replacing any earlier one, unless this account
    // has already had MAX_OTP_REQUESTS in the last 24 hours. The check and
    // the issue are one conditional update, so parallel requests can't get
    // past the limit.
    const otp = generateRandomOTP();
    const now = new Date();
    const recent = {
      $filter: {
        input: { $ifNull: ["$resetOtpRequests", []] },
        cond: { $gt: ["$$this", new Date(now.getTime() - OTP_REQUEST_WINDOW_MS)] },
      },
    };
    const issued = await user.constructor.findOneAndUpdate(
      { _id: user._id, $expr: { $lt: [{ $size: recent }, MAX_OTP_REQUESTS] } },
      [{
        $set: {
          resetOtpRequests: { $concatArrays: [recent, [now]] },
          resetOtpHash: otpHash(user._id, otp),
          resetOtpExpire: new Date(now.getTime() + OTP_MINUTES * 60 * 1000),
          resetOtpAttempts: 0,
        },
      }]
    );
    if (!issued) {
      return next(new ErrorResponse(
        "Too many codes have been requested for this account today. Please try again tomorrow.", 429
      ));
    }

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
    const Model = user.constructor;
    const noCode = () => new ErrorResponse(
      "There's no valid code for this account: it has expired, been used, or had too many wrong attempts. Request a new code.", 400
    );

    // Spend one attempt before comparing. The increment only happens while
    // the code is live and has attempts left, and it's atomic, so parallel
    // guesses can't get more than MAX_OTP_ATTEMPTS between them.
    const attempt = await Model.findOneAndUpdate(
      {
        _id: user._id,
        resetOtpHash: { $type: "string" },
        resetOtpExpire: { $gt: new Date() },
        resetOtpAttempts: { $lt: MAX_OTP_ATTEMPTS },
      },
      { $inc: { resetOtpAttempts: 1 } },
      { new: true }
    ).select("+resetOtpHash +resetOtpAttempts");
    if (!attempt) return next(noCode());

    if (otpHash(user._id, req.body.otp) !== attempt.resetOtpHash) {
      const left = MAX_OTP_ATTEMPTS - attempt.resetOtpAttempts;
      if (left <= 0) {
        // Out of attempts: the code is gone, and a new one must be requested
        await Model.updateOne(
          { _id: user._id, resetOtpHash: attempt.resetOtpHash },
          { $unset: { resetOtpHash: "", resetOtpExpire: "", resetOtpAttempts: "" } }
        );
        return next(new ErrorResponse("Too many wrong codes. Request a new code.", 400));
      }
      return next(new ErrorResponse(`That code isn't right. ${left} attempt${left === 1 ? "" : "s"} left.`, 400));
    }

    // Right code. Spend it and issue a single-use reset token in the same
    // update — conditional on the code still being this one, so a code
    // can't be spent twice. The token is random, returned only to whoever
    // verified, stored only as a hash, and short-lived; resetPassword
    // accepts it and nothing else, so knowing the email isn't enough to
    // walk into someone else's reset.
    const resetToken = crypto.randomBytes(32).toString("hex");
    const spent = await Model.findOneAndUpdate(
      { _id: user._id, resetOtpHash: attempt.resetOtpHash },
      {
        $unset: { resetOtpHash: "", resetOtpExpire: "", resetOtpAttempts: "" },
        $set: {
          resetPasswordToken: sha256(resetToken),
          resetPasswordExpire: new Date(Date.now() + RESET_TOKEN_MINUTES * 60 * 1000),
        },
      }
    );
    if (!spent) return next(noCode());

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
