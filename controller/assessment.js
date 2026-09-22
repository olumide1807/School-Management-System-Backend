// middleware
const { asyncHandler } = require("../middleware");
const { validateCreateAsssessmentFormat } = require("../middleware/validation");

const { assessmentModel, classLevelModel } = require("../models");

const ErrorResponse = require("../utils/errorResponse");
const { successResponse } = require("../utils/successResponse");
const { isValidMongoId } = require("../utils/isValidMongoObjectId");

const getSchoolId = (req) => (req.user.schoolName ? req.user.id : req.user.schoolId);

// Assessments must add up to 100 — otherwise every result computed from
// them is silently out of the wrong denominator
const assertTotalIsOneHundred = (assessments) => {
    const total = assessments.reduce((sum, a) => sum + Number(a.maxScore), 0);
    return total === 100 ? null : total;
};

// ============================================================
// CREATE — POST /assessment
// ============================================================
exports.createAssessmentFormat = asyncHandler(async (req, res, next) => {
    try {
        const { error } = validateCreateAsssessmentFormat(req.body);
        if (error) {
            return next(new ErrorResponse(error.details[0].message, 400));
        }

        const schoolId = getSchoolId(req);
        const { classLevel, assessments } = req.body;

        if (!isValidMongoId(classLevel)) {
            return next(new ErrorResponse("Invalid class level provided!", 400));
        }

        // The class level must belong to this school
        const level = await classLevelModel.findOne({ _id: classLevel, schoolId });
        if (!level) {
            return next(new ErrorResponse("Class level not found!", 404));
        }

        const wrongTotal = assertTotalIsOneHundred(assessments);
        if (wrongTotal !== null) {
            return next(new ErrorResponse(
                `Assessments must add up to 100. Yours total ${wrongTotal}.`, 400
            ));
        }

        const attendanceItems = assessments.filter((a) => a.source === "attendance");
        if (attendanceItems.length > 1) {
            return next(new ErrorResponse(
                "Only one attendance assessment is allowed", 400
            ));
        }

        const exists = await assessmentModel.findOne({ schoolId, classLevel });
        if (exists) {
            return next(new ErrorResponse(
                `An assessment format already exists for ${level.levelName}. Edit it instead.`, 400
            ));
        }

        await assessmentModel.create({ assessments, classLevel, schoolId });

        successResponse(res, 201, "Assessment format created successfully!", null);
    } catch (e) {
        console.error("Error creating assessment format!", e);
        next(e);
    }
});

// ============================================================
// EDIT — PUT /assessment/:classLevelId
// ============================================================
exports.editAssessmentFormat = asyncHandler(async (req, res, next) => {
    try {
        const { error } = validateCreateAsssessmentFormat(req.body);
        if (error) {
            return next(new ErrorResponse(error.details[0].message, 400));
        }

        const schoolId = getSchoolId(req);
        const { classLevelId } = req.params;
        const { assessments } = req.body;

        if (!isValidMongoId(classLevelId)) {
            return next(new ErrorResponse("Invalid class level provided!", 400));
        }

        const wrongTotal = assertTotalIsOneHundred(assessments);
        if (wrongTotal !== null) {
            return next(new ErrorResponse(
                `Assessments must add up to 100. Yours total ${wrongTotal}.`, 400
            ));
        }

        const attendanceItems = assessments.filter((a) => a.source === "attendance");
        if (attendanceItems.length > 1) {
            return next(new ErrorResponse(
                "Only one attendance assessment is allowed", 400
            ));
        }
        
        const assessment = await assessmentModel.findOne({
            schoolId,
            classLevel: classLevelId
        });

        if (!assessment) {
            return next(new ErrorResponse(
                "No assessment format exists for this class level yet!", 404
            ));
        }

        assessment.assessments = assessments;
        await assessment.save();

        successResponse(res, 200, "Assessment format edited successfully!", null);
    } catch (e) {
        console.error("Error editing assessment format!", e);
        next(e);
    }
});

// ============================================================
// GET ONE — GET /assessment/:classLevelId
// ============================================================
exports.getAssessmentFormat = asyncHandler(async (req, res, next) => {
    try {
        const schoolId = getSchoolId(req);
        const { classLevelId } = req.params;

        if (!isValidMongoId(classLevelId)) {
            return next(new ErrorResponse("Invalid class level provided!", 400));
        }

        const assessment = await assessmentModel.findOne({
            schoolId,
            classLevel: classLevelId
        });

        // An unconfigured level is an empty state, not an error — the teacher's
        // score sheet needs to say "not set up yet", not fail
        successResponse(res, 200, null, assessment || null);
    } catch (e) {
        console.error("Error getting assessment format!", e);
        next(e);
    }
});

// ============================================================
// GET ALL — GET /assessment
// ============================================================
exports.getAllAssessmentFormats = asyncHandler(async (req, res, next) => {
    try {
        const schoolId = getSchoolId(req);

        const assessments = await assessmentModel
            .find({ schoolId })
            .populate("classLevel", "levelName levelShortName");

        successResponse(res, 200, null, assessments);
    } catch (e) {
        console.error("Error getting assessment formats!", e);
        next(e);
    }
});