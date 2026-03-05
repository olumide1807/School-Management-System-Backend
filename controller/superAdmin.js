// utils
const ErrorResponse = require("../utils/errorResponse");
const cloudinary = require("../utils/cloudinary");
const {
  GenerateSignature,
  GeneratePassword,
  ValidatePassword,
} = require("../utils/index");
const sendEmail = require("../utils/sendgrid");
const { sendTokenResponse } = require("../utils/sendResponseToken");
const { successResponse } = require("../utils/successResponse");
const { isValidMongoId } = require("../utils/isValidMongoObjectId")

//middlewares
const { asyncHandler } = require("../middleware");
const {
  validateSuperAdmin,
  validateLoginSuperAdmin,
  validateForgotPassword,
  validateEditSuperAdmin,
  validateUpdatePassword,
  validateAddSchoolAccountDetails,
} = require("./../middleware/validation");

// library and tools
const crypto = require("crypto");
const NodeCache = require("node-cache");
const myCache = new NodeCache();
const { v4: uuidv4 } = require("uuid");

// models
const { adminModel, SuperAdminModel, sessionModel } = require("../models");

// db crud functions
const { createSuperAdmin } = require("../dbCrudFunctions/superAdmin");

// ===================================================== REGISTER SUPER ADMIN ===============================================================

// @desc      Super admin creates an account
// @route
// @access    Super Admin

exports.registerSuperAdmin = asyncHandler(async (req, res, next) => {
  try {
    // Validate request body
    const { error } = validateSuperAdmin(req.body);

    if (error) {
      // return res.status(400).json({ success: false, error: error.details });
      return next(new ErrorResponse(error.details[0].message, 400));
    }

    // Check if the email already exists in the database
    const emailExists = await SuperAdminModel.findOne({
      emailAddress: req.body.emailAddress,
    });

    if (emailExists) {
      return next(new ErrorResponse("Email already exists!", 400));
    }

    // Check if superAdmin by schoolEmailAddress
    const superAdminExists = await SuperAdminModel.findOne({
      schoolEmailAddress: req.body.schoolEmailAddress,
    });

    if (superAdminExists) {
      return next(new ErrorResponse("School email address already exists!", 400));
    }

    // Generate a unique ID
    const uniqueID = uuidv4();

    myCache.set(uniqueID, req.body, 30 * 24 * 60 * 60); // 30 days.

    console.log("...........uniqueID........... ", uniqueID);

    // configure the notifcation system
    const verifierMail = "ayodejiabdussalam@gmail.com";
    const message = `A request for school creation has been made.
    \n\n 
    The school details - ${JSON.stringify(req.body)} \n\n
     Click the link:\n\n ${req.protocol}://${req.get(
      "host"
    )}/superadmin/acceptApplication/${uniqueID} to accept the request.`;
    const html = `<p>${message}</p>`;

    // send message
    const sendMessage = await sendEmail(
      verifierMail,
      "School Management System Invite",
      message,
      html
    );

    // if status is false, send error message
    if (!sendMessage.status) {
      return next(new ErrorResponse(sendMessage.message, 400));
    }

    successResponse(
      res,
      200,
      "Application successful!, a message will be sent to your email address once your application is accepted."
    );
  } catch (err) {
    console.error(err);
    next(err);
  }
});

// ============================================================ ACCEPT APPLICATION ============================================================

// @desc      Super admin accepts an invite
// @route      PUT /api/v1/auth/acceptInvite/:signature
// @access    Public
exports.acceptApplication = asyncHandler(async (req, res, next) => {
  try {
    // check if req.params.signature exists in the temporary cache storage, take it and its value
    const superAdminInfo = myCache.take(req.params.signature);

    // if not, send error response
    if (!superAdminInfo) {
      return next(new ErrorResponse(`Link doesn't exist or is expired!`, 404));
    }

    // generate a random password
    const randomPassword = Math.random().toString(36).substring(2, 9);
    console.log(".................randomPassword............. ", randomPassword);

    // hash the random password
    const hashedPassword = await GeneratePassword(randomPassword);

    // create the user in the database
    const user = await SuperAdminModel.create({
      ...superAdminInfo,
      password: hashedPassword,
    });

    // configure notification system.
    const message = `Congratulations!. Your application has been accepted and Your account has been created.\n Your password is ${randomPassword} and email is ${user.emailAddress}`;
    const html = `<p>${message}</p>`;

    const sendMessage = await sendEmail(
      user.emailAddress,
      "Acceptance of Application Into School Management System.",
      message,
      html
    );

    if (!sendMessage.status) {
      return next(new ErrorResponse(sendMessage.message, 400));
    }

    successResponse(res, 200, sendMessage.message);
  } catch (err) {
    console.error("error creating school", err);
    next(err);
  }
});

// ======================================= LOGIN SUPERADMIN ================================

// @desc      Super admin login
// @route
// @access    Super Admin
exports.loginSuperAdmin = asyncHandler(async (req, res, next) => {
  try {
    // Validate request body
    const { error } = validateLoginSuperAdmin(req.body);

    if (error) {
      return next(new ErrorResponse(error.details[0].message, 400));
    }

    const { email, password } = req.body;

    // does the email address exist in the database
    const superAdmin = await SuperAdminModel.findOne({
      emailAddress: email,
    });

    // if not, error
    if (!superAdmin) {
      return next(new ErrorResponse("Invalid credentials", 404));
    }

    // check if the password is correct
    const validPassword = await ValidatePassword(password, superAdmin.password);

    // if not, error
    if (!validPassword) {
      return next(new ErrorResponse("Invalid credentials", 401));
    }

    // If authentication is successful, send token response
    sendTokenResponse(superAdmin.id, 200, res);
  } catch (err) {
    console.error("error logging in", err);
    next(err);
  }
});


// =========================== GET PROFILE ======================================================
// @desc      Super admin get its profile
// @route
// @access    Super Admin
exports.getProfile = asyncHandler(async (req, res, next) => {
  try {
    const admin = await SuperAdminModel.findById(req.user.id);

    if (!admin) {
      return next(
        new ErrorResponse(`Admin with id ${req.user.id} not found`, 404)
      );
    }

    // Avoid exposing sensitive information, only include necessary fields
    const { _id, emailAddress, fullName, createdAt, phoneNumber, schoolName } =
      admin;

    res.status(200).json({
      success: true,
      data: {
        _id,
        emailAddress,
        fullName,
        createdAt,
        phoneNumber,
        schoolName,
      },
    });
  } catch (err) {
    console.error(err);
    next(err);
  }
});

// =========================== UPDATE PROFILE ======================================================

// @desc      Super admin updates its profile
// @route
// @access    Super Admin
exports.updateProfile = asyncHandler(async (req, res, next) => {
  try {
    // Validate the request body
    const { error } = validateEditSuperAdmin(req.body);
    if (error) {
      return next(new ErrorResponse(error.details[0].message, 400));
    }

    // Find the superadmin by id from the database
    const superAdmin = await SuperAdminModel.findById(req.user.id);
    if (!superAdmin) {
      return next(
        new ErrorResponse(`Admin with id ${req.user.id} not found`, 404)
      );
    }

    // Store the previous data of the superadmin
    const prevData = {
      firstName: superAdmin.firstName,
      lastName: superAdmin.lastName,
      emailAddress: superAdmin.emailAddress,
      phoneNumber: superAdmin.phoneNumber,
      schoolName: superAdmin.schoolName,
      schoolMotto: superAdmin.schoolMotto,
      schoolEmailAddress: superAdmin.schoolEmailAddress,
      schoolAddress: superAdmin.schoolAddress,
      schoolInitials: superAdmin.schoolInitials,
      schoolAccountDetails: superAdmin.schoolAccountDetails,
    };

    // Cache the previous data
    myCache.set(
      superAdmin.emailAddress,
      JSON.stringify(prevData),
      7 * 24 * 60 * 60
    ); // Set a TTL of 7 days

    // Update the superadmin's information with the request body
    const fieldsToUpdate = [
      "firstName",
      "lastName",
      "emailAddress",
      "phoneNumber",
      "schoolName",
      "schoolMotto",
      "schoolEmailAddress",
      "schoolInitials",
    ];

    fieldsToUpdate.forEach((field) => {
      if (req.body[field]) {
        superAdmin[field] = req.body[field];
      }
    });

    // Update the school address if provided
    // the req.body takes precedenece if superadmin has the same field with it 
    if (req.body.schoolAddress) {
      superAdmin.schoolAddress = {
        ...superAdmin.schoolAddress,
        ...req.body.schoolAddress,
      };
    }

    // Update the school account details if provided
    // the req.body takes precedenece if superadmin has the same field with it 
    if (req.body.schoolAccountDetails) {
      superAdmin.schoolAccountDetails = {
        ...superAdmin.schoolAccountDetails,
        ...req.body.schoolAccountDetails,
      };
    }

    // Save the updated superadmin
    await superAdmin.save();

    // Configure a notification system
    const message = `An update has been made in your information.\nThe update details include ${JSON.stringify(
      req.body
    )}.\nIf this is not you, please click the below link to revert the changes 👇 and make sure to change your password.\n${
      req.protocol
    }://${req.get("host")}/superadmin/revert?email=${superAdmin.emailAddress}`;
    const html = `<p>${message}</p>`;

    // Send a notification email
    const sendMessage = await sendEmail(
      superAdmin.emailAddress,
      "Basitech SMS - Notification on Information Update.",
      message,
      html
    );

    // Handle the email sending result
    const successMessage = sendMessage.status
      ? "A message has been sent to your email address. Please check it out."
      : "Error occurred while notifying you";

    successResponse(
      res,
      200,
      `Information updated successfully!. ${successMessage}`
    );
  } catch (err) {
    console.error(err);
    next(err);
  }
});


// =========================== UPDATE PASSWORD ======================================================


// @desc      Super admin change its password
// @route
// @access    Super Admin
exports.updatePassword = asyncHandler(async (req, res, next) => {
  try {
    // Validate request body
    const { error } = validateUpdatePassword(req.body);

    if (error) {
      return res.status(400).json({ success: false, error: error.details });
    }

    // Find the super admin by ID and retrieve the current hashed password
    const superAdmin = await SuperAdminModel.findById(req.user.id).select(
      "+password"
    );

    if (!superAdmin) {
      return next(
        new ErrorResponse(`Admin with id ${req.user.id} not found`, 404)
      );
    }

    // Validate the current password
    if (
      !(await ValidatePassword(req.body.currentPassword, superAdmin.password))
    ) {
      return next(new ErrorResponse(`Current password is incorrect`, 401));
    }

    // Generate and save the new hashed password
    const hashedPassword = await GeneratePassword(req.body.newPassword);
    superAdmin.password = hashedPassword;
    await superAdmin.save();

    // If the password update is successful, send a token response
    sendTokenResponse(superAdmin.id, 200, res);
  } catch (err) {
    console.error(err);
    next(err);
  }
});

// @desc      Super admin deletes itself
// @route
// @access    Super Admin
exports.deleteASuperAdmin = asyncHandler(async (req, res, next) => {
  try {
    const superAdmin = await SuperAdminModel.findByIdAndDelete(req.params.id);

    if (!superAdmin) {
      return next(
        new ErrorResponse(`Super admin with ID ${req.params.id} not found`, 404)
      );
    }

    res.status(200).json({
      success: true,
      data: "Account deleted, along with everything attached to it.",
    });
  } catch (err) {
    console.error(err);
    next(err);
  }
});

// @desc Photo upload for super admin
// @route POST/photoUpload
// @access Super Admin
exports.photoUpload = asyncHandler(async (req, res, next) => {
  try {
    if (!req.file) {
      return next(new ErrorResponse("Please upload a file", 400));
    }

    const superAdmin = await SuperAdminModel.findById(req.user.id);

    if (!superAdmin) {
      return next(
        new ErrorResponse(`Admin with id ${req.user.id} not found`, 404)
      );
    }

    const file = req.file;

    // Check if the file selected is an image
    if (!file.mimetype.startsWith("image")) {
      return next(
        new ErrorResponse(
          "Unsupported Image Format! The accepted formats are png and jpeg.",
          400
        )
      );
    }

    // Upload image to Cloudinary
    const result = await cloudinary.uploader.upload(file.path);

    // Save Cloudinary URL to superAdmin's profile
    superAdmin.schoolLogo = result.secure_url;
    await superAdmin.save();

    res.status(200).json({
      success: true,
      data: superAdmin,
    });
  } catch (err) {
    console.error(err);

    // Handle specific Cloudinary errors or any other unexpected errors
    next(err);
  }
});

exports.deleteAccountDetails = asyncHandler(async (req, res, next) => {
  try {
    const superAdmin = await SuperAdminModel.findById(req.user.id);

    if (!superAdmin) {
      return next(
        new ErrorResponse(`User with id ${req.user.id} not found`, 404)
      );
    }

    superAdmin.schoolAccountDetails = {
      accountNumber: null,
      accountName: null,
      bankName: null,
    };

    await superAdmin.save();

    successResponse(res, 200, "bank account details successfully deleted.");
  } catch (err) {
    console.error(err);
    next(err);
  }
});

// ================================================ REVERT CHANGES ============================

exports.revertChanges = asyncHandler(async (req, res, next) => {
  try {
    // Retrieve cache entry
    const cacheEntry = myCache.take(req.query.email);

    const prevData = JSON.parse(cacheEntry);

    // If prevData is null or undefined, send an error response
    if (!prevData) {
      return next(new ErrorResponse("Link not found or expired", 404));
    }

    // Find superadmin by email address
    const superAdmin = await SuperAdminModel.findOne({
      emailAddress: req.query.email,
    });

    // If superadmin doesn't exist, send an error response
    if (!superAdmin) {
      return next(
        new ErrorResponse("SuperAdmin doesn't exist in the database", 404)
      );
    }

    // Update superadmin with prevData
    Object.assign(superAdmin, prevData);

    // Save the updated superadmin
    await superAdmin.save();

    // Send a success response
    successResponse(res, 200, "Changes reverted successfully");
  } catch (err) {
    console.error(err);
    next(err);
  }
});

//////////////////////////////////////////////////////////////////////////

exports.getAccountDetails = asyncHandler(async(req, res, next) => {
  try {
    // extract schoolId
    const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;

    // validate schoolId
    if (!isValidMongoId(schoolId)) {
      return next(new ErrorResponse("Invalid school Id provided!", 400));
    }

    // find school by id
    const school = await SuperAdminModel.findById(schoolId);

    if (!school) {
      return next(new ErrorResponse("school not found!, please try again.", 404))
    }

    // return success response
    successResponse(res, 200, null, school.schoolAccountDetails);
  } catch(e) {
    next(e);
    console.error("error getting account details.", e);
  } 
})

exports.openRegistration = asyncHandler (async (req, res, next) => {
  try {
    // extract schoolId
    const schoolId = req.user.id;

    // find session by current and schoolId
    const session = await sessionModel.findOne({
      schoolId,
      currentSession: true
    });

    if (!session) {
      return next(new ErrorResponse("No current session in your school!", 404));
    };

    // update school in regards to registration
    const school = await SuperAdminModel.findByIdAndUpdate(schoolId, { isRegistrationOpen: true }, {new: true});

    // return success response
    successResponse(res, 200, "subject registration has been successfully opened!");
  } catch(e) {
    console.error("Error opening registration!", e);
    next(e);
  }
})

exports.closeRegistration = asyncHandler (async (req, res, next) => {
  try {
    // extract schoolId
    const schoolId = req.user.id;

    // update school in regards to registration
    const school = await SuperAdminModel.findByIdAndUpdate(schoolId, { isRegistrationOpen: false }, {new: true});

    // return success response
    successResponse(res, 200, "subject registration has been successfully closed!");
  } catch(e) {
    console.error("Error closing registration!", e);
    next(e);
  }
})