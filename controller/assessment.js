// middleware
const { asyncHandler } = require("../middleware");
const { validateCreateAsssessmentFormat } = require("../middleware/validation");

const { assessmentModel } = require("../models")

const ErrorResponse = require("../utils/errorResponse");
const { successResponse } = require("../utils/successResponse");

exports.createAssessmentFormat = asyncHandler(async (req, res, next) => {
    try {
        // validate the request body
        const { error } = validateCreateAsssessmentFormat(req.body);

        if (error) {
            return next(new ErrorResponse(error.details[0].message, 400));
        };

        // extract the schoolId
        const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;

        // check if assessment exists by schoolId
        const assessment = await assessmentModel.findOne({ schoolId });

        if (assessment) {
            return next(new ErrorResponse("Assessment Format already exists in your school!", 400));
        }

        // destructure the request body
        const {body} = req;

        // create assessment
        await assessmentModel.create({...body, schoolId});

        // send response
        successResponse(res, 201, "Assessment Format Created Successfully!", null);
    } catch (e) {
        console.error("Error creating assessment format!", e);
        next(e);
    }
});

exports.editAssessmentFormat = asyncHandler(async (req, res, next) => {
    try {
        // validate request body
        const { error } = validateCreateAsssessmentFormat(req.body);

        if (error) {
            return next(new ErrorResponse(error.details[0].message, 400));
        }

        // extract the schoolId
        const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;

        // check if assessment exists by schoolId
        const assessment = await assessmentModel.findOne({ schoolId });

        if (!assessment) {
            return next(new ErrorResponse("Assessment Format has not been created in your school!", 400));
        }

        // update
        await assessmentModel.findByIdAndUpdate(assessment.id, req.body);

        // send response
        successResponse(res, 200, "Assessment Format Edited Successfully!", null);
    } catch (e) {
        console.error("Error editing assessment format!", e);
        next(e);
    }
});

exports.getAssessmentFormat = asyncHandler(async (req, res, next) => {
    try {
        // extract the schoolId
        const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;

        // check if assessment exists by schoolId
        const assessment = await assessmentModel.findOne({ schoolId });

        if (!assessment) {
            return next(new ErrorResponse("Assessment Format has not been created in your school!", 400));
        }

        // send response
        successResponse(res, 200, null, assessment);
    } catch (e) {
        console.error("Error getting assessment format!", e);
        next(e);
    }
});