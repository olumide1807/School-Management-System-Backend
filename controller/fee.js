const asyncHandler = require("../middleware/async");
const { validateCreateFee } = require("../middleware/validation");
const { successResponse } = require("../utils/successResponse");
const ErrorResponse = require("../utils/errorResponse");
const {
  sessionModel,
  termModel,
  classArmModel,
  feeModel,
} = require("../models");
const { isValidMongoId } = require("../utils/isValidMongoObjectId");
const classArm = require("../models/classArm");

exports.createFee = asyncHandler(async (req, res, next) => {
  try {
    // Validate the request body using a custom validation function
    const { error } = validateCreateFee(req.body);
    if (error) {
      // If validation fails, return an error response
      return next(new ErrorResponse(error.details[0].message, 400));
    }

    // Destructure the necessary properties from the request object
    const { body, user } = req;
    const { termId, classArms, currency, fees } = body;

    // Extract the schoolId from the user object
    const schoolId = user.schoolName ? user.id : user.schoolId;

    // Validate the termId to ensure it's a valid MongoDB ObjectId
    if (!isValidMongoId(termId)) {
      // If termId is invalid, return an error response
      return next(new ErrorResponse("Invalid termId provided!", 400));
    }

    // Check if the term exists for the given termId and schoolId
    const term = await termModel.findOne({ _id: termId, schoolId });
    if (!term) {
      // If the term does not exist, return an error response
      return next(new ErrorResponse("Term not found!", 404));
    }

    // Validate and check if all class arms exist
    const classArmsValidationPromises = classArms.map(async (arm) => {
      if (!isValidMongoId(arm)) {
        // If any class arm Id is invalid, throw an error
        throw new ErrorResponse("Invalid class arm Id(s) provided!", 400);
      }
      const classArm = await classArmModel.findOne({ _id: arm, schoolId });
      if (!classArm) {
        // If any class arm does not exist, throw an error
        throw new ErrorResponse(
          "One or more of the class arms provided not found!",
          404
        );
      }
    });

    // Wait for all validation promises to complete
    await Promise.all(classArmsValidationPromises);

    // Prepare operations for each class arm to check for existing fees and update/create accordingly
    const feeOperations = classArms.map(async (arm) => {
      // Check if a fee record already exists for the given termId, classArmId, and schoolId
      const feeExists = await feeModel.findOne({ schoolId, termId, classArmId: arm });

      if (feeExists) {
        // If a fee record exists, update it with the new data
        return feeModel.updateOne({ _id: feeExists.id }, { currency, fees });
      } else {
        // If no fee record exists, create a new fee record
        return feeModel.create({ schoolId, termId, classArmId: arm, currency, fees });
      }
    });

    // Wait for all fee operations to complete
    await Promise.all(feeOperations);

    // Send a success response indicating that the fee creation/update was successful
    successResponse(res, 201, "Fee creation/update successful");
  } catch (e) {
    // Log any errors that occur and pass them to the error handler middleware
    console.error("Error creating fee!", e);
    next(e);
  }
});

exports.getFee = asyncHandler(async (req, res, next) => {
  try{
    // destructure the request object
    const { user, query, params } = req;

    // extract the schoolId from user
    const schoolId = user.schoolName ? user.id : user.schoolId;

    // initialize the search object
    let search = {
      schoolId
    };

    if (query) {
      // destructure the query object
      const { termId, classArmId } = query;

      if (termId) search.termId = termId;
      if (classArmId) search.classArmId = classArmId;
    }

    // validate the Ids
    for (const index in search) {
      let indexValue = search[index];

      if (!isValidMongoId(indexValue)) {
        return next(new ErrorResponse("One or more of the Ids provided are invalid!", 400));
      }
    };

    // find the fee
    const fee = await feeModel.find(search);

    // send response
    successResponse(res, 200, null, fee);
  }catch(e){
    // log any errors that occur and pass them to the error handler middleware
    console.error("Error getting fee(s)", e);
    next(e);
  }
})

exports.getFeeById = asyncHandler(async (req, res, next) => {
  try {
    // Destructure necessary properties from the request object
    const { user, params: { feeId } } = req;

    // Determine the school ID based on the user object
    const schoolId = user.schoolName ? user.id : user.schoolId;

    // Validate provided feeId using a simple check for valid MongoDB ObjectId
    if (!isValidMongoId(feeId)) {
      return next(new ErrorResponse("Invalid fee Id provided!", 400));
    }

    // Find the fee for given schoolId and feeId
    const fee = await feeModel.findOne({ _id: feeId, schoolId });

    // Check if the fee exists
    if (!fee) {
      return next(new ErrorResponse("Fee not found!", 404));
    }

    // Send success response
    successResponse(res, 200, null, fee);

  } catch (e) {
    // Log error to the console and send to the next middleware
    console.error("Error getting fee", e);
    next(e);
  }
});

exports.deleteFee = asyncHandler(async (req, res, next) => {
  try {
    // Destructure necessary properties from the request object
    const { user, params: { feeId } } = req;

    // Determine the school ID based on the user object
    const schoolId = user.schoolName ? user.id : user.schoolId;

    // Validate provided feeId using a simple check for valid MongoDB ObjectId
    if (!isValidMongoId(feeId)) {
      return next(new ErrorResponse("Invalid fee Id provided!", 400));
    }

    // Find and delete the fee in a single operation
    const result = await feeModel.findOneAndDelete({ _id: feeId, schoolId });

    // Check if the fee was found and deleted
    if (!result) {
      return next(new ErrorResponse("Fee not found!", 404));
    }

    // Send success response
    successResponse(res, 200, "Fee deleted successfully");

  } catch (e) {
    // Log error to the console and send to the next middleware
    console.error("Error deleting fee", e);
    next(e);
  }
});
