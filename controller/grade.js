const {gradeModel, SuperAdminModel} = require('../models/index')
const asyncHandler = require("../middleware/async");
const ErrorResponse = require("../utils/errorResponse");
const { validateCreateGradeSystem, validateUpdateGradeSystem } = require("../middleware/validation");
const sendNotificationFallback = require("../utils/sendNotificationFallback");
const { successResponse } = require("../utils/successResponse");
const { isValidMongoId } = require("../utils/isValidMongoObjectId");

exports.createGrade = asyncHandler(async (req, res, next) => {
    try{
        // validate request body
        const { error } = validateCreateGradeSystem(req.body);

        if (error) {
            return next(new ErrorResponse(error.details[0].message, 400));
        }

        // extract the schoolId
        const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;

        // destructure the request body
        const { name, grades } = req.body;

        // find if Grade system exists by name and schoolId
        const gradeExists = await gradeModel.findOne({
            name,
            schoolId
        });

        if (gradeExists) {
            return next(new ErrorResponse("Grade system already exists by name!", 400));
        };

        // destructure the request body
        const { body } = req;

        // create grade system
        const gradeSystem = await gradeModel.create({
            schoolId,
            ...body
        });

        // notify the school about the grade system creation
        const school = await SuperAdminModel.findById(schoolId);
        const recipient = school.emailAddress;
        const message = `You have successfully created a new grade system for your organization. Kindly review it!`;
        const html = `<p>${message}</p>`;
        const title = `Successful Creation of Grade System on SMS`;

        const sendMessage = await sendNotificationFallback(
            recipient,
            title,
            message,
            html
        );

        const successMessage = `New Grade System successfully created!`;

        // send response
        successResponse(res, 201, successMessage, null);

    }catch(e){
        console.error("Error creating Grade system!", e);
        next(e);
    }
})


exports.getGradeById = asyncHandler(async (req, res, next) => {
    try{
        // extract the schoolId
        const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;

        // extract id from request params
        const {id} = req.params;

        // validate id
        if(!isValidMongoId(id)) {
            return next(new ErrorResponse("Invalid Id provided!", 400));
        }

        // find the grade by id and schoolId
        const grade = await gradeModel.findOne({
            _id: id,
            schoolId
        });

        if(!grade){
            return next(new ErrorResponse("Grade system does not exist!", 404));
        };

        // response
        successResponse(res, 200, null, grade);
    }catch(e){
        console.error("Error getting a grade by Id!", e);
        next(e);
    }
})

exports.changeGradeFormat = asyncHandler(async(req,res,next) =>{
    try{
        // validate the request body
        const { error } = validateUpdateGradeSystem(req.body);

        if (error) {
            return next(new ErrorResponse(error.details[0].message, 400));
        }

        // extract schoolId
        const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;

        // extract id from request params
        const {id} = req.params;

        // validate id
        if(!isValidMongoId(id)) {
            return next(new ErrorResponse("Invalid Id provided!", 400));
        }

        // find the grade by id and schoolId
        const grade = await gradeModel.findOne({
            _id: id,
            schoolId
        });

        if(!grade){
            return next(new ErrorResponse("Grade system does not exist!", 404));
        };

        // destructure the request body
        const { name, grades } = req.body;

        if (name) {
            const gradeNameExists = await gradeModel.findOne({ name, schoolId });

            if (gradeNameExists) {
                return next(new ErrorResponse("Grade system name already exists!", 400));
            }
        }

        // update the grade format
        await gradeModel.findByIdAndUpdate(id, req.body);

        // response
        successResponse(res, 200, "Grade System updated successfully!", null);
    }catch(e){
        console.error("Error changing grade format!", e);
        next(e);
    }
})