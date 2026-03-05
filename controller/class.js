const asyncHandler = require("../middleware/async");
const {
  validateCreateClass,
  validateCreateArm,
  validateUpdateClass,
  validateUpdateArm,
} = require("../middleware/validation");
const { successResponse } = require("../utils/successResponse");
const { isValidMongoId } = require("../utils/isValidMongoObjectId");

const { classArmModel, classLevelModel, staffModel, SuperAdminModel } = require("../models");
const ErrorResponse = require("../utils/errorResponse");
const sendNotificationFallback = require("../utils/sendNotificationFallback");
const classArm = require("../models/classArm");

exports.createClass = asyncHandler(async (req, res, next) => {
  const { error } = validateCreateClass(req.body);

  if (error) {
    return res.status(400).json({ success: false, error: error.details[0].message });
  }

  const schoolId = req.user?.schoolName ? req.user.id : req.user?.schoolId;

  try {
    // Check if class level exists by name and schoolId
    const classLevelExists = await classLevelModel.findOne({
      levelName: req.body.levelName,
      schoolId,
    });

    if (classLevelExists) {
      return next(new ErrorResponse("Class level already exists!", 400));
    }

    // Create new class level
    const newClassLevel = await classLevelModel.create({
      levelName: req.body.levelName,
      levelShortName: req.body.levelShortName,
      schoolId,
    });

    // Create class arms
    if (req.body.armNames && req.body.armNames.length >= 1) {
      for(armName of req.body.armNames) {
        // create new class arm
        const classArm = await classArmModel.create({ armName, schoolId, classLevelId: newClassLevel.id });
      }
    }


    successResponse(res, 201, "Class Level created successfully!", newClassLeve);
  } catch (error) {
    console.error("Error creating class:", error);
    next(error);
  }
});

////////////////////////////////////////////////////////

exports.createClassArm = asyncHandler(async (req, res, next) => {
  // validate request body.
  const { error } = validateCreateArm(req.body);

  if (error) {
    return next(new ErrorResponse(error.details[0].message, 400));
  }

  // extract the schoolId
  const schoolId = req.user?.schoolName ? req.user.id : req.user?.schoolId;

  // extract the classLevelId from the request params
  const { classLevelId } = req.params;

  // destructure the request body
  const { armName } = req.body;

  try {
    // Check if class level exists by name and schoolId
    const classLevel = await classLevelModel.findOne({
      _id: classLevelId,
      schoolId,
    });

    if (!classLevel) {
      return next(new ErrorResponse("Class level does not exist!", 400));
    }

    // Check if class arm exists by armName, classLevelId, and schoolId
    const classArmExists = await classArmModel.findOne({
      armName,
      classLevelId,
      schoolId,
    });

    if (classArmExists) {
      return next(new ErrorResponse("Class arm already exists!", 400));
    }

    // Create new class arm
    const newClassArm = await classArmModel.create({
      armName,
      classLevelId,
      schoolId,
    });

    successResponse(res, 201, "Class arm created successfully!", null);
  } catch (error) {
    console.error("Error creating class arm:", error);
    next(error);
  }
});

////////////////////////////////////////////////////////

exports.getAllClassLevels = asyncHandler(async (req, res, next) => {
  try {
    // extract the schoolId.
    const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;

    // find all class levels by schoolId.
    const classLevels = await classLevelModel.find({ schoolId });

    // return response and data.
    successResponse(res, 200, null, classLevels);

  } catch (error) {
    console.error("error getting all class levels", error);
    next(error);
  }
});

////////////////////////////////////////////////////////

exports.getClassLevelById = asyncHandler(async (req, res, next) => {
  try {
    // extract schoolId
    const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;

    // extract levelId from request params
    const { levelId } = req.params;

    // validate levelId
    if (!isValidMongoId(levelId)) {
      return next(new ErrorResponse("invalid levelId provided!", 400));
    }

    // find class level by levelId and schoolId
    const classLevel = await classLevelModel.findOne({
      _id: levelId,
      schoolId
    });

    if (!classLevel) {
      return next(new ErrorResponse("class level not found!", 404));
    }

    // return response and data
    successResponse(res, 200, null, classLevel);
  } catch (error) {
    console.error("error getting class level by Id", error);
    next(error);
  }
});

////////////////////////////////////////////////////////

exports.updateClass = asyncHandler(async (req, res, next) => {
  const { error } = validateUpdateClass(req.body);

  if (error) {
    return next(new ErrorResponse(error.details[0].message, 400));
  }

  // extract the schoolId
  const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;

  // extract id from request params
  const { id } = req.params;

  // validate id
  if (!isValidMongoId(id)) {
    return next(new ErrorResponse("Invalid Id provided!", 400));
  }

  try {
    // Find class level by id and schoolId
    const classLevel = await classLevelModel.findOne({
      _id: id,
      schoolId,
    });

    if (!classLevel) {
      return next(new ErrorResponse('Class level does not exist!', 404));
    }

    // Update class level
    const newClassLevel = await classLevelModel.findByIdAndUpdate(
      id,
      req.body,
      { new: true, runValidators: true }
    );

    successResponse(res, 200, "Class level updated successfully!", null);
  } catch (error) {
    console.error("Error updating class level!", error);
    next(error);
  }
});

////////////////////////////////////////////////////////

exports.updateArm = asyncHandler(async (req, res, next) => {
  // validate request body
  const { error } = validateUpdateArm(req.body);

  if (error) {
    return next(new ErrorResponse(error.details[0].message, 400));
  };

  // extract schoolId
  const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;

  // extract id from request params
  const { id } = req.params;

  // validate id
  if (!isValidMongoId(id)) {
    return next(new ErrorResponse("Invalid Id provided!", 400));
  }

  // destructure the request body
  const { armName } = req.body;

  try {
    // Find class arm by id and schoolId
    const classArm = await classArmModel.findOne({
      _id: id,
      schoolId,
    });

    if (!classArm) {
      return next(new ErrorResponse('Class arm does not exist!', 404));
    }

    // update
    classArm.armName = armName;

    // save to the database
    await classArm.save();

    successResponse(res, 200, "Class arm updated successfully!", null);
  } catch (error) {
    console.error("Error updating class arm!", error);
    next(error);
  }
});

////////////////////////////////////////////////////////

exports.deleteClass = asyncHandler(async (req, res, next) => {
  // extract the schoolId
  const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;

  // extract id request params
  const { id } = req.params;

  // validate id
  if (!isValidMongoId(id)) {
    return next(new ErrorResponse("Invalid Id provided!", 400));
  }

  try {
    // Find class level by id and schoolId
    const classLevel = await classLevelModel.findOne({
      _id: id,
      schoolId,
    });

    if (!classLevel) {
      return next(new ErrorResponse('Class level does not exist!', 404));
    }

    // Delete class level and associated arms
    await classLevelModel.findByIdAndDelete(req.params.id);
    await classArmModel.deleteMany({ classLevelId: id });

    successResponse(res, 200, "Class level(with all its class arms) has been deleted successfully!", null);
  } catch (error) {
    console.error("Error deleting class level!", error);
    next(error);
  }
});

////////////////////////////////////////////////////////

exports.deleteArm = asyncHandler(async (req, res, next) => {
  // extract the schoolId
  const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;

  // extract id from request params
  const { id } = req.params;

  // validate id
  if (!isValidMongoId(id)) {
    return next(new ErrorResponse("Invalid Id provided!", 400));
  }

  try {
    // Find class arm by id and schoolId
    const classArm = await classArmModel.findOne({
      _id: id,
      schoolId,
    });

    if (!classArm) {
      return next(new ErrorResponse('Class arm does not exist!', 404));
    }

    // Delete class arm
    await classArmModel.findByIdAndDelete(id);

    successResponse(res, 200, "Class arm deleted successfully!", null);
  } catch (error) {
    console.error("Error deleting class arm!", error);
    next(error);
  }
});


/////////////////////////////////////////////////////////////////////////////////////////

exports.getAllClassArms = asyncHandler(async (req, res, next) => {
  try{
    // extract the schoolId
    const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;

    // find all class arms by schoolId
    const classArms = await classArmModel.find({ schoolId });

    // return response and data
    successResponse(res, 200, null, classArms);
  }catch(e){
    console.error("Error getting all class arms", e);
    next(e);
  }
})


///////////////////////////////////////////////////////////////////////////////////

exports.getAllClassArmsInALevel = asyncHandler(async (req, res, next) => {
  try{
    // extract the schoolId.
    const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;

    // extract the request param
    const { levelId } = req.params;

    // validate the levelId
    if (!isValidMongoId(levelId)) {
      return next(new ErrorResponse('levelId is not valid!', 400));
    }

    // check if level exists in the school
    const classLevel = await classLevelModel.findOne({
      _id: levelId,
      schoolId
    });

    if (!classLevel) {
      return next(new ErrorResponse('class level does not exist!', 404));
    }
    
    // find all class arms by schoolId and classLevelId
    const classArms = await classArmModel.find({
      schoolId,
      classLevelId: levelId
    });
    
    // return response and data
    successResponse(res, 200, null, classArms);
  }catch(e){
    console.error("Error getting all class arms in a level", e);
    next(e);
  }
});

///////////////////////////////////////////

exports.getClassArmById = asyncHandler(async (req, res, next) => {
  try{
    // extract schoolId
    const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;

    // extract armId from request params
    const { armId } = req.params;

    // validate armId
    if(!isValidMongoId(armId)) {
      return next(new ErrorResponse("invalid armId provided!", 400));
    }

    // find classArm by armId and schoolId
    const classArm = await classArmModel.findOne({
      _id: armId,
      schoolId
    });

    if (!classArm) {
      return next(new ErrorResponse("class arm does not exist!", 404));
    }

    // send response and data
    successResponse(res, 200, null, classArm);
  }catch(e){
    console.error("error getting class arm by Id", e);
    next(e);
  }
})

/////////////////////////////////////////////////

exports.assignTeacherToClass = asyncHandler(async (req, res, next) => {
  try{
    // extract the schoolId
    const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;

    // extract classArmId and staffId from request params
    const { classArmId, staffId } = req.params;

    // validate classArmId and staffId
    for(id of [classArmId, staffId]) {
      if(!isValidMongoId(id)) {
        return next(new ErrorResponse("invalid classArmId or/and teacherId provided!", 400));
      }
    }

    // check if staff(must be academic) exists by staffId and schoolId
    const staff = await staffModel.findOne({
      _id: staffId,
      schoolId,
      staffType: "academic"
    });

    if (!staff) {
      return next(new ErrorResponse("staff is not academic or does not exist!", 404));
    }

    // check if classArm exists by classArmId and schoolId
    const classArm = await classArmModel.findOne({
      _id: classArmId,
      schoolId
    });

    if (!classArm) {
      return next(new ErrorResponse("class arm does not exist!", 404));
    }

    // assign teacher to classArm
    classArm.assignedTeacher = staffId;
    await classArm.save();

    // ------------------ notify the staff
    const school = await SuperAdminModel.findById(schoolId);
    const classLevel = await classLevelModel.findById(classArm.classLevelId);
    const message = `Congratulations! You have been assigned the class teacher of a "${classLevel.levelName} ${classArm.armName}" in "${school.schoolName}". Please visit your dashboard to view it.`;
    const html = `<p>${message}</p>`;
    const title = `Assignment To "${classLevel.levelName} ${classArm.armName}" at "${school.schoolName}"`;

    // process message
    const sendMessage = await sendNotificationFallback(
      staff.emailAddress,
      title,
      message,
      html
    );

    // result message
    let additionalMessage = sendMessage ? "" : "but notification wasn't sent successfully to the staff's email address. Please help send it manually."
    // --------------------------------------

    // successMessage
    const successMessage = `Teacher "${staff.firstName} ${staff.surname}" has been assigned to class arm "${classLevel.levelName} ${classArm.armName}" successfully!. ${additionalMessage}`;

    // send response and data
    successResponse(res, 200, successMessage, null);
  }catch(e){
    console.error("error assigning teacher to a class arm", e);
    next(e);
  }
})