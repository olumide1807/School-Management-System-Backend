// utils
const { getStaffByEmail } = require("./../dbCrudFunctions/staff");
const generateRandomPassword = require("../utils/generateRandomPassword");
const { GeneratePassword, ValidatePassword } = require("../utils");
const ErrorResponse = require("../utils/errorResponse");
const { sendTokenResponse } = require("../utils/sendResponseToken");
const sendEmail = require("../utils/sendgrid");
const sendNotificationFallback = require("../utils/sendNotificationFallback");
const { successResponse } = require("../utils/successResponse");
const { isValidMongoId } = require("../utils/isValidMongoObjectId");
const { changeTimeFormat, timeFormat } = require("../utils/formatTime");
const cloudinary = require("../utils/cloudinary");

// middleware
const {
  validateCreateStaff,
  validateLoginStaff,
  validateUpdateStaff,
  validateUpdatePassword,
  validateCreateStaffAttendance,
  validateUpdateStaffAttendance,
} = require("../middleware/validation");
const { asyncHandler } = require("../middleware");
const Protect = require("../middleware/auth");

// models
const {
  SuperAdminModel,
  staffModel,
  classArmModel,
  classLevelModel,
  staffAttendanceModel,
  sessionModel,
  specificSubjectModel
} = require("../models");

////////////////////////////////////////////////////////////////////////////////////////////////

exports.createStaff = asyncHandler(async (req, res, next) => {
  try {
    const { body, file, user } = req;
    const { assignedSubjects, assignedClasses, ...others } = body;

    // Validate request body
    const { error } = validateCreateStaff(body);
    if (error) {
      return next(new ErrorResponse(error.details[0].message, 400));
    }

    // Extract schoolId
    const schoolId = user.schoolName ? user.id : user.schoolId;
    others.schoolId = schoolId;

    // Check if staff already exists in the school
    const existingStaff = await staffModel.findOne({
      emailAddress: others.emailAddress,
      schoolId,
    });
    if (existingStaff) {
      return next(new ErrorResponse("Staff already exists!", 400));
    }

    // Upload profile picture if provided
    if (file) {
      const result = await cloudinary.uploader.upload(file.path);
      others.profilePicture = result.secure_url;
    }

    // Generate random password and hash it
    const password = generateRandomPassword();
    const hashedPassword = await GeneratePassword(password);
    others.password = hashedPassword;

    // Create the staff in the database
    const newStaff = await staffModel.create(others);

    // Send notification
    const school = await SuperAdminModel.findById(schoolId);
    const message = `Congratulations! You have been added to ${school.schoolName} as a staff (${newStaff.staffType}). Your password is ${password} and email is ${others.emailAddress}`;
    const html = `<p>${message}</p>`;
    const title = `Addition into ${school.schoolName}'s staff team.`;
    const sendMessage = await sendNotificationFallback(
      others.emailAddress,
      title,
      message,
      html
    );
    let additionalMessage = sendMessage ? "" : "but notification wasn't sent successfully to the staff's email address. Please help send the message manually.";

    // Set subject teachers
    if (assignedSubjects) {
      for (const subject of assignedSubjects) {
        if (isValidMongoId(subject)) {
          await specificSubjectModel.findOneAndUpdate(
            { _id: subject, schoolId },
            { subjectTeacherId: newStaff.id }
          );
        }
      }
    }

    // Set class teachers
    if (assignedClasses) {
      for (const Class of assignedClasses) {
        if (isValidMongoId(Class)) {
          await classArmModel.findOneAndUpdate(
            { _id: Class, schoolId },
            { assignedTeacher: newStaff.id }
          );
        }
      }
    }

    const successMessage = `Staff created successfully ${additionalMessage}`;
    successResponse(res, 201, successMessage, null);
  } catch (error) {
    console.error("An error occurred while creating staff:", error);
    next(error);
  }
});


///////////////////////////////////////////////////////////////////////////////////////////////////

exports.Login = asyncHandler(async (req, res, next) => {
  try {
    const { error } = validateLoginStaff(req.body);

    if (error) {
      return res.status(400).json({ status: false, error: error.details });
    }

    let staff;

    if (req.body.email) {
      staff = await staffModel.findOne({ email: req.body.email });
    }

    if (req.body.staffId && !staff) {
      staff = await staffModel.findOne({ staffId: req.body.staffId });
    }

    if (!staff) {
      return next(new ErrorResponse("Invalid credentials!", 401));
    }

    const validPassword = await ValidatePassword(
      req.body.password,
      staff.password
    );

    if (!validPassword) {
      return next(new ErrorResponse("Invalid credentials!", 401));
    }

    sendTokenResponse(staff.id, 200, res);
  } catch (error) {
    console.error("Error during login:", error);
    return next(
      new ErrorResponse(
        "Error during login. Please try again or contact the dev team.",
        500
      )
    );
  }
});

/////////////////////////////////////////////////////////////////////////////////////////////////////////

exports.getAdminStaffs = asyncHandler(async (req, res, next) => {
  try{
      // extract the schoolId
  const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;

  // find all admin staffs
  const staffs = await staffModel.find({
    isAdmin: true,
    schoolId
  });

  // send response
  successResponse(res, 200, null, staffs);
  } catch (error) {
    console.error("Error getting admin staffs:", error);
    next(error);
  }
});

///////////////////////////////////////////////////////////////////////////////////////////////////////////

exports.getAllStaffs = asyncHandler(async (req, res, next) => {
  try{
      // extract the schoolId
  const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;

  // set the search
  let search = {
    schoolId
  }

  if (req.query.role) {
    search.staffType = req.query.role
  }

  // find all staffs
  const staffs = await staffModel.find(search);

  // send response
  successResponse(res, 200, null, staffs);
  } catch (error) {
    console.error("Error getting all staffs:", error);
    next(error);
  }
});

////////////////////////////////////////////////////////////////////////////////////////////////////////

exports.getStaffById = asyncHandler(async (req, res, next) => {
  const staffId = req.params.id;

  const query = {
    _id: staffId,
    schoolId: req.user.schoolName ? req.user.id : req.user.schoolId,
  };

  try {
    const staff = await staffModel.findOne(query);

    if (!staff) {
      return res.status(404).json({
        success: false,
        error: "Staff not found",
      });
    }

    res.status(200).json({
      success: true,
      data: staff,
    });
  } catch (error) {
    console.error("Error fetching staff by ID:", error);
    return res.status(500).json({
      success: false,
      error:
        "Error fetching staff by ID. Please try again or contact the dev team.",
    });
  }
});

exports.updateStaff = asyncHandler(async (req, res, next) => {
  try {
    // Validate the request body using Joi schema
    const { error } = validateUpdateStaff(req.body);

    if (error) {
      return res.status(400).json({ success: false, error: error.details });
    }

    // Check if the staff with the specified ID exists
    const staff = await staffModel.findOne({ _id: req.params.id });

    if (!staff) {
      return next(new ErrorResponse("Staff not found!", 404));
    }

    if (req.body.qualifications) {
      req.body.qualifications =
        req.body.qualifications.length >= 1
          ? [...staff.qualifications, ...req.body.qualifications]
          : staff.qualifications;
    }

    const updatedStaff = await staffModel.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    return res.status(200).json({ success: true, data: updatedStaff });
  } catch (error) {
    console.error("Error updating staff:", error);
    return next(
      new ErrorResponse(
        "Error updating staff. Please try again or contact the dev team.",
        500
      )
    );
  }
});

///////////////////////////////////////////////////////////////////////////////////////////////////

exports.updateStaffPassword = asyncHandler(async (req, res, next) => {
  try {
    // Validate the request body using Joi schema
    const { error } = validateUpdatePassword(req.body);

    if (error) {
      return res.status(400).json({ success: false, error: error.details });
    }

    // Find the staff by ID
    const staff = await staffModel.findById(req.user.id).select("+password");

    if (!staff) {
      return next(
        new ErrorResponse(`Staff with ID ${req.user.id} not found`, 404)
      );
    }

    // Check if the current password matches the stored password
    const isCurrentPasswordValid = await ValidatePassword(
      req.body.currentPassword,
      staff.password
    );

    if (!isCurrentPasswordValid) {
      return next(new ErrorResponse(`Current password is incorrect`, 401));
    }

    // Check if the new password is the same as the current password
    if (req.body.currentPassword === req.body.newPassword) {
      return next(
        new ErrorResponse(
          `New password must be different from the current password`,
          400
        )
      );
    }

    // Hash the new password
    const hashedPassword = await GeneratePassword(req.body.newPassword);

    // Update the staff's password
    staff.password = hashedPassword;
    await staff.save();

    sendTokenResponse(staff.id, 200, res, "Password updated successfully");
  } catch (error) {
    console.error("Error updating staff password:", error);
    return next(
      new ErrorResponse(
        "Error updating staff password. Please try again or contact the dev team.",
        500
      )
    );
  }
});

////////////////////////////////////////////////////////////////////////////////////////////////////////

exports.makeAdmin = asyncHandler(async (req, res, next) => {
  try {
    if (!isValidMongoId(req.params.id)) {
      return next(new ErrorResponse("invalid id provided", 400));
    }

    const staff = await staffModel.findOneAndUpdate(
      { _id: req.params.id, schoolId: req.user.id },
      { isAdmin: true }, // set admin to true.
      { new: true }
    );

    if (!staff) {
      return next(
        new ErrorResponse(`Staff with ID ${req.params.id} not found`, 404)
      );
    }

    const superAdmin = await SuperAdminModel.findById(req.user.id);

    const recipient = staff.emailAddress;
    const school = superAdmin.schoolName;
    const subject = `Promotion To ${school}'s Administrative Board`;
    const text = `Hello ${staff.firstName}. You have been promoted to ${school}'s administrative board. Congrats! Keep the fire burning :)`;
    const html = `<p>${text}</p>`;

    const sendMessage = await sendNotificationFallback(recipient, subject, text, html);

    let additionalMessage = sendMessage 
      ? `The system has successfully notified ${staff.firstName}!`
      : `The system has failed to notify ${staff.firstName}! Please endeavor to do that manually.`;

    let successMessage = `Staff has been successfully promoted to the school's Administrative board. ${additionalMessage}`;  

    successResponse(res, 200, successMessage, null);
  } catch (error) {
    console.error("Error making staff admin:", error);
    return next(error);
  }
});

////////////////////////////////////////////////////////////////////////////////////////////////////

exports.removeAdmin = asyncHandler(async (req, res, next) => {
  try {
    if (!isValidMongoId(req.params.id)) {
      return next(new ErrorResponse("invalid id provided", 400));
    }

    const staff = await staffModel.findOneAndUpdate(
      { _id: req.params.id, schoolId: req.user.id, isAdmin: true },
      { isAdmin: false }, // set isAdmin prop to false
      { new: true }
    );

    if (!staff) {
      return next(
        new ErrorResponse(`Admin staff with ID ${req.params.id} not found`, 404)
      );
    }

    const superAdmin = await SuperAdminModel.findById(req.user.id);

    const recipient = staff.emailAddress;
    const school = superAdmin.schoolName;
    const subject = `Removal From ${school}'s Administrative Board`;
    const text = `Hello ${staff.firstName}. You have been removed from ${school}'s administrative board.`;
    const html = `<p>${text}</p>`;

    const sendMessage = await sendNotificationFallback(recipient, subject, text, html);

    let additionalMessage = sendMessage
      ? `The system has successfully notified ${staff.firstName}!`
      : `The system has failed to notify ${staff.firstName}! Please endeavor to do that manually.`;

    let successMessage = `Staff has been successfully removed from the school's Administrative board. ${additionalMessage}`;  

    successResponse(res, 200, successMessage, null);
  } catch (error) {
    console.error("Error removing staff admin:", error);
    return next(error);
  }
});

///////////////////////////////////////////////////////////////////////////////////////////////////////

exports.assignClass = asyncHandler(async (req, res, next) => {
  try {
    const classArm = await classArmModel.findById(req.params.classArmId);

    if (!classArm) {
      return next(
        new ErrorResponse(`Class Arm with ID ${req.params.id} not found`, 404)
      );
    }

    const classLevel = await classLevelModel.findById(classArm.classLevelId);

    const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;

    let staff;

    if (req.query.staffId) {
      staff = await staffModel.findOne({
        staffId: req.query.staffId,
        schoolId,
      });
    } else if (req.query.email) {
      staff = await staffModel.findOne({ email: req.query.email, schoolId });
    }

    if (!staff) {
      return next(new ErrorResponse(`Staff not found!`, 404));
    }

    staff.classAssigned = req.params.classArmId;
    await staff.save();

    const subject = `Assignment As ${classLevel.levelShortName} ${classArm.armName}'s class teacher`;
    const text = `Hello ${staff.name}. You have been assigned as ${classLevel.levelShortName} ${classArm.armName}'s class teacher.`;

    const html = `<p>${text}</p>`;

    const sendMessage = await sendEmail(staff.email, subject, text, html);

    let status = sendMessage.status
      ? `The system has successfully notified ${staff.name}!`
      : `The system has failed to notify ${staff.name}! Please endeavor to do that manually.`;

    res.status(200).json({
      success: true,
      message: `Class Arm has been assigned to the class teacher`,
      status,
    });
  } catch (error) {
    console.error("Error assigning class:", error);
    return next(
      new ErrorResponse(
        "Error assigning class. Please try again or contact the dev team.",
        500
      )
    );
  }
});

////////////////////////////////////////////////////////////////////////////////////////////////////

exports.createAttendance = asyncHandler(async (req, res, next) => {
  try {
    // validate the request body
    const { error } = validateCreateStaffAttendance(req.body);

    if (error) {
      return next(new ErrorResponse(error.details[0].message, 400));
    }

    const { staffId, sessionId } = req.body;
    const { user } = req;
    const schoolId = user.schoolName ? user.id : user.schoolId;

    const IDs = [staffId, sessionId];

    // validate IDs
    for (id of IDs) {
      if (!isValidMongoId(id)) {
        throw new ErrorResponse("Invalid ID(s) provided!", 400);
      }
    }

    // check if staff exists in the school
    const staff = await staffModel.findOne({
      _id: staffId,
      schoolId,
    });

    if (!staff) {
      return next(new ErrorResponse("Staff doesn't exist in your school", 404));
    }

    // check if session exists in the school
    const session = await sessionModel.findOne({
      _id: sessionId,
      schoolId,
    });

    if (!session) {
      return next(
        new ErrorResponse("Session does not exist in your school", 404)
      );
    }

    req.body.schoolId = schoolId;

    // check if the staff attendace exists
    const StaffAttendance = await staffAttendanceModel.findOne(req.body);

    if (StaffAttendance) {
      return next(
        new ErrorResponse("staff attendance has already created!", 400)
      );
    }

    // create staff attendance
    staffAttendanceModel.create(req.body).then((data) => {
      successResponse(res, 200, "staff attendance successfully created!");
    });
  } catch (err) {
    console.error("Error creating attendance:", err);
    return next(err);
  }
});

/////////////////////////////////////////////////////////////////////////////

exports.getAllStaffAttendance = asyncHandler(async (req, res, next) => {
  try {
    const { user } = req;
    const schoolId = user.schoolName ? user.id : user.schoolId;
    const { query } = req;
    const { staffId, sessionId, term, date, status, staffType } = query;

    // validate the IDs
    const IDs = [staffId, sessionId];
    for (id of IDs) {
      if (id) {
        if (!isValidMongoId(id)) {
          throw new ErrorResponse("Invalid ID(s) provided!", 400);
        }
      }
    }

    // update the query
    query.schoolId = schoolId;

    // find
    let attendances = await staffAttendanceModel.find(query);

    let message = null;

    if (attendances.length < 1) {
      message = "Staff attendance list empty!";
      attendances = null;
    }

    successResponse(res, 200, message, attendances);
  } catch (error) {
    console.error(
      "An error occured while fetching students attendance!",
      error
    );
    next(error);
  }
});

//////////////////////////////////////////////////////////////////////////////////////

exports.getStaffAttendance = asyncHandler(async (req, res, next) => {
  try {
    const { user } = req;
    const schoolId = user.schoolName ? user.id : user.schoolId;
    const { query } = req;
    const { term, sessionId, date, status, staffType } = query;
    const { id } = req.params;

    // validate the IDs
    const IDs = [sessionId, id];
    for (Id of IDs) {
      if (Id) {
        if (!isValidMongoId(Id)) {
          throw new ErrorResponse("Invalid ID(s) provided!", 400);
        }
      }
    }

    // update the query
    query.schoolId = schoolId;
    query.staffId = id;

    // find
    const attendance = await staffAttendanceModel.findOne(query);

    if (!attendance) {
      return next(new ErrorResponse("Staff attendance not found!", 404));
    }

    successResponse(res, 200, null, attendance);
  } catch (error) {
    console.error("An error occured while fetching staff attendance!", error);
    next(error);
  }
});

///////////////////////////////////////////////////////////////////////////////////////////
exports.updateAttendance = asyncHandler(async (req, res, next) => {
  try {
    const { error } = validateUpdateStaffAttendance(req.body);

    if (error) {
      return next(new ErrorResponse(error.details[0].message, 400));
    }

    const { user } = req;

    const schoolId = user.schoolName ? user.id : user.schoolId;

    if (!isValidMongoId(req.params.id)) {
      return next(new ErrorResponse("Invalid ID provided!", 400));
    }

    // does attendance exist by id and schoolId?
    const attendance = await staffAttendanceModel.findOne({
      _id: req.params.id,
      schoolId,
    });

    if (!attendance) {
      return next(new ErrorResponse("Staff attendance not found!", 404));
    }

    const { status } = req.body;

    attendance.status = status;

    await attendance.save();

    successResponse(res, 200, "staff attendance updated successfully");
  } catch (error) {
    console.error("An error ocurred while updating staff attendance:", error);
    return next(
      new ErrorResponse(
        "An error occurred while updating staff attendance. If the issue persists, contact the dev team.",
        500
      )
    );
  }
});

///////////////////////////////////////////////////////////////////////////////////
exports.deleteAttendance = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    const { user } = req;
    const schoolId = user.schoolName ? user.id : user.schoolId;

    // check if the id is valid
    if (!isValidMongoId(id)) {
      return next(new ErrorResponse("Invalid ID provided"));
    }

    // check if the attendance with the ID exists in the school
    const attendance = await staffAttendanceModel.findOne({
      _id: id,
      schoolId,
    });

    if (!attendance) {
      return next(
        new ErrorResponse(
          "student attendance does not exist in your school!",
          404
        )
      );
    }

    const classArm = await classArmModel.findById(attendance.classArmId);

    // check if the user is the school or the class teacher
    if (!user.schoolName && classArm.assignedTeacher != user.id) {
      return next(
        new ErrorResponse("You don't have access to this operation!", 403)
      );
    }

    // delete the attendance
    await studentAttendanceModel.findByIdAndDelete(id);

    successResponse(res, 200, "student attendance deleted successfully");
  } catch (error) {
    console.error("An error occured while deleting student attendance!", error);
    next(error);
  }
});
