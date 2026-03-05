// middlewares
const { asyncHandler } = require("../middleware");
const {
  validateCreateTimetable,
  validateUpdateTimetable,
  validateSetPeriodTime,
} = require("../middleware/validation");

// models
const { classArmModel, timeTableModel, periodTimeModel } = require("../models");
const moment = require("moment");

// utils
const { isValidMongoId } = require("../utils/isValidMongoObjectId");
const ErrorResponse = require("../utils/errorResponse");
const { successResponse } = require("../utils/successResponse");
const getPeriodTime = require("../utils/getPeriodTime");
const validateTimeDifference = require("../utils/validateTimeDifference");
const { formatTime } = require("../utils/formatTime");
const { getMoments } = require("../utils/getMoments");
const { updateTimetableEntry } = require("../utils/updateTimetableEntry");
const { getClassArm } = require("../utils/getClassArm");
const { getSubject } = require("../utils/getSubject");
const { getTeacher } = require("../utils/getTeacher");
const { updateSubjectTeacher } = require("../utils/updateSubjectTeacher");
const { getOrSetPeriodTime } = require("../utils/getOrSetPeriodTime");
const {
  checkTimetableEntryExistence,
} = require("../utils/checkTimetableEntryExistence");
const { createNewTimetableEntry } = require("../utils/createNewTimetableEntry");

/////////////////////////////////////////////////////////////////////

exports.createTimetable = asyncHandler(async (req, res, next) => {
  try {
    // validate request body
    const { error } = validateCreateTimetable(req.body);

    if (error) {
      return next(new ErrorResponse(error.details[0].message, 400));
    }

    // destructure the request body
    const { body, file } = req;
    const { type, classArmId } = body;

    // validate classArmId
    if (!isValidMongoId(classArmId)) {
      return next(new ErrorResponse("Invalid classArmId provided!", 400));
    }

    // find class arm by type, classArmId, schoolId
    const classArmExists = await classArmModel.findOne({
      type,
      _id: classArmId,
      schoolId: req.user.schoolName ? req.user.id : req.user.schoolId,
    });

    if (classArmExists) {
      return next(
        new ErrorResponse("Timetable has already been set for this class arm")
      );
    }

    // save the file to cloudinary and get the url
    const result = await cloudinary.uploader.upload(file.path);
    const { secure_url } = result;

    // create class arm
    await classArmModel
      .create({
        ...body,
        schoolId: req.user.schoolName ? req.user.id : req.user.schoolId,
        file: secure_url,
      })
      .then(() => {
        successResponse(res, 201, "Timetable set successfully!", null);
      })
      .catch((e) => {
        console.error("Error creating class arm!", e);
        next(e);
      });
  } catch (e) {
    console.error("Error creating timetable!", e);
    next(e);
  }
});

/////////////////////////////////////////////////////////////////////

exports.getAllTimetableEntriesInAClass = asyncHandler(
  async (req, res, next) => {
    const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;

    const classArm = await classArmModel.findOne({
      _id: req.params.classArmId,
      schoolId,
    });

    if (!classArm) {
      return next(new ErrorResponse("The classArm does not exist 😢", 404));
    }

    let timetableEntries;

    const findType = req.query.type ? req.query.type : "class";

    timetableEntries = await timeTableModel.find({
      classArmId: classArm.id,
      schoolId,
      type: findType,
    });

    res.status(200).json({
      success: true,
      data:
        timetableEntries.length < 1
          ? `You have not created any timetable entries with the type: {${findType}} here 🙂`
          : timetableEntries,
    });
  }
);

/////////////////////////////////////////////////////////////////////

exports.updateATimetableEntry = asyncHandler(async (req, res, next) => {
  const { error } = validateUpdateTimetable(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details[0].message,
    });
  }

  const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;

  const { type } = req.query;

  const timetableEntry = await timeTableModel.findOne({
    _id: req.params.timetableEntryId,
    schoolId,
    type: type ? type : "class",
  });

  if (!timetableEntry) {
    return next(
      new ErrorResponse(
        `Timetable entry not found with the type *${
          type ? type : "class"
        }* not found 😢`,
        404
      )
    );
  }

  const { daysOfTheWeek, startTime, endTime } = req.body;

  const [startTimeFormatted, endTimeFormatted] = formatTime(startTime, endTime);

  if (!startTimeFormatted || !endTimeFormatted) {
    return res.status(400).json({
      status: false,
      error:
        "Invalid time format. Please use 'h:mmAM/PM', e.g., '7:00AM', '6:00PM'.",
    });
  }

  const periodTime = await periodTimeModel.findById(
    timetableEntry.periodTimeId
  );

  const {
    startTimeMoment,
    endTimeMoment,
    periodStartTimeMoment,
    periodEndTimeMoment,
  } = getMoments(startTimeFormatted, endTimeFormatted, periodTime);

  if (
    startTimeMoment.isBefore(periodStartTimeMoment) ||
    endTimeMoment.isAfter(periodEndTimeMoment)
  ) {
    return next(
      new ErrorResponse(
        `Invalid time range. Check the start and end times against period time 😢`,
        400
      )
    );
  }

  validateTimeDifference(
    startTimeFormatted,
    endTimeFormatted,
    periodTime?.periodInterval,
    next
  );

  const timetableExists = await checkTimetableEntryExistence(
    timetableEntry.classArmId,
    schoolId,
    daysOfTheWeek,
    startTime,
    endTime,
    timetableEntry.id,
    "excluding",
    next,
    type ? type : "class"
  );

  if (timetableExists === true) {
    return next(
      new ErrorResponse(
        "The requested timetable entry overlaps with an existing entry! 😢",
        400
      )
    );
  }

  updateTimetableEntry(
    timetableEntry,
    daysOfTheWeek,
    startTimeFormatted,
    endTimeFormatted,
    periodTime.id
  );

  res.status(200).json({
    success: true,
    data: timetableEntry,
  });
});

/////////////////////////////////////////////////////////////////////

exports.deleteATimetableEntry = asyncHandler(async (req, res, next) => {
  try {
    const { schoolName, id: userId, schoolId: userSchoolId } = req.user;
    const schoolId = schoolName ? userId : userSchoolId;

    const { type } = req.query;
    const Type = type ? type : "class";

    // Check if timetable entry exists and belongs to the user
    const timetableEntry = await timeTableModel.findOne({
      _id: req.params.timetableEntryId,
      schoolId,
      type: Type,
    });

    if (!timetableEntry) {
      return next(
        new ErrorResponse(
          `Timetable entry not found with the type *${Type}* not found 😢`,
          404
        )
      );
    }

    // Delete the timetable entry
    await timeTableModel.findByIdAndDelete(req.params.timetableEntryId);

    res.status(200).json({
      success: true,
      message: "Timetable entry deleted successfully! 🙂",
    });
  } catch (err) {
    console.error(err);
    return next(new ErrorResponse("Failed to delete timetable entry", 500));
  }
});

/////////////////////////////////////////////////////////////////////
exports.getAllTimetable = asyncHandler(async (req, res) => {
  try {
    // find timetables by schoolId
    const timetables = await classArmModel.find({
      schoolId: req.user.schoolName ? req.user.id : req.user.schoolId,
    });

    // send response
    successResponse(res, 200, null, timetables);
  } catch (e) {
    console.error("error getting all timetables", e);
    next(e);
  }
});

///////////////////////////////////////////////////////////////////

exports.getAllTimetablesInAClassArm = asyncHandler(async (req, res) => {
  try {
    // destructure the request param
    const { classArmId } = req.params;

    // validate classArmId
    if (!isValidMongoId(classArmId)) {
      return next(new ErrorResponse("Invalid class arm id provided!", 400));
    }

    // find timetables by schoolId and classArmId
    const timetables = await classArmModel.find({
      schoolId: req.user.schoolName ? req.user.id : req.user.schoolId,
      classArmId,
    });

    // send response
    successResponse(res, 200, null, timetables);
  } catch (e) {
    console.error("error getting all timetables in a class arm", e);
    next(e);
  }
});

////////////////////////////////////////////////////////////////////
exports.getTypeTimetables = asyncHandler(async (req, res) => {
  try {
    // find timetables by schoolId and type
    const timetables = await classArmModel.find({
      schoolId: req.user.schoolName ? req.user.id : req.user.schoolId,
      type: req.query.type,
    });

    // send response
    successResponse(res, 200, null, timetables);
  } catch (e) {
    console.error("error getting timetables", e);
    next(e);
  }
});

//////////////////////////////////////////////////////////////////

exports.getTypeTimetablesInAClassArm = asyncHandler(async (req, res) => {
  try {
    // validate req.params.classArmId
    if (!isValidMongoId(req.params.classArmId)) {
      return next(new ErrorResponse("Invalid class arm id provided!", 400));
    }

    // find timetables by schoolId and type
    const timetables = await classArmModel.find({
      schoolId: req.user.schoolName ? req.user.id : req.user.schoolId,
      type: req.query.type,
      classArmId: req.params.classArmId,
    });

    // send response
    successResponse(res, 200, null, timetables);
  } catch (e) {
    console.error("error getting timetables", e);
    next(e);
  }
});

exports.replaceTimetableFile = asyncHandler(async (req, res, next) => {
  try {
    // destructure the request
    const { file, params, query, user } = req;
    const { classArmId } = params;
    const { type } = query;
    const schoolId = user.schoolName ? user.id : user.schoolId;

    // validate classArmId
    if (!isValidMongoId(classArmId)) {
      return next(new ErrorResponse("Invalid classArmId provided!", 400));
    }

    // find class arm by type, classArmId, schoolId
    const classArm = await classArmModel.findOne({
      type,
      _id: classArmId,
      schoolId,
    });

    if (!classArm) {
      return next(
        new ErrorResponse(
          `${type} timetable has not been set for this class arm!`,
          404
        )
      );
    }

    // save the file to cloudinary and get the url
    const result = await cloudinary.uploader.upload(file.path);
    const { secure_url } = result;

    // update class arm
    classArm.file = secure_url;

    // save to database
    await classArm.save();

    // send response
    successResponse(res, 200, "Timetable file replaced successfully!");
  } catch (e) {
    console.error("Error replacing timetable!", e);
    next(e);
  }
});

exports.deleteTimetable = asyncHandler(async (req, res, next) => {
  try {
    // destructure the request
    const { params, query, user } = req;
    const { classArmId } = params;
    const { type } = query;
    const schoolId = user.schoolName ? user.id : user.schoolId;

    // validate classArmId
    if (!isValidMongoId(classArmId)) {
      return next(new ErrorResponse("Invalid classArmId provided!", 400));
    }

    // find class arm by type, classArmId, schoolId
    const classArm = await classArmModel.findOne({
      type,
      _id: classArmId,
      schoolId,
    });

    if (!classArm) {
      return next(
        new ErrorResponse(
          `${type} timetable has not been set for this class arm!`,
          404
        )
      );
    }

    // delete classArm
    await classArmModel.findByIdAndDelete(classArmId);

    // send response
    successResponse(res, 200, "Timetable has been deleted successfully!");
  } catch (e) {
    console.error("Error deleting timetable!", e);
    next(e);
  }
});
