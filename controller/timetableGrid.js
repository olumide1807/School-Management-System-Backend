const asyncHandler = require("../middleware/async");
const ErrorResponse = require("../utils/errorResponse");
const { successResponse } = require("../utils/successResponse");
const { periodSettingsModel, timetableGridModel } = require("../models");

// ==================== PERIOD SETTINGS ====================

exports.getPeriodSettings = asyncHandler(async (req, res, next) => {
    try {
        const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;
        const settings = await periodSettingsModel.findOne({ schoolId });
        
        if (!settings) {
            return successResponse(res, 200, null, null);
        }
        
        successResponse(res, 200, null, settings);
    } catch (e) {
        console.error("Error getting period settings:", e);
        next(e);
    }
});

exports.savePeriodSettings = asyncHandler(async (req, res, next) => {
    try {
        const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;
        const { startTime, endTime, periodDuration, breaks } = req.body;

        if (!startTime || !endTime || !periodDuration) {
            return next(new ErrorResponse("startTime, endTime, and periodDuration are required", 400));
        }

        // Upsert — create or update
        const settings = await periodSettingsModel.findOneAndUpdate(
            { schoolId },
            { startTime, endTime, periodDuration, breaks: breaks || [], schoolId },
            { upsert: true, new: true, runValidators: true }
        );

        successResponse(res, 200, "Period settings saved successfully!", settings);
    } catch (e) {
        console.error("Error saving period settings:", e);
        next(e);
    }
});

// ==================== TIMETABLE GRID ====================

exports.getTimetableGrid = asyncHandler(async (req, res, next) => {
    try {
        const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;
        const { classArmId } = req.params;
        const type = req.query.type || "class";

        const timetable = await timetableGridModel.findOne({ 
            classArmId, 
            schoolId, 
            type 
        });

        successResponse(res, 200, null, timetable);
    } catch (e) {
        console.error("Error getting timetable grid:", e);
        next(e);
    }
});

exports.saveTimetableGrid = asyncHandler(async (req, res, next) => {
    try {
        const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;
        const { classArmId } = req.params;
        const type = req.query.type || "class";
        const { grid } = req.body;

        if (!grid) {
            return next(new ErrorResponse("grid data is required", 400));
        }

        // Upsert — create or update
        const timetable = await timetableGridModel.findOneAndUpdate(
            { classArmId, schoolId, type },
            { grid, classArmId, schoolId, type },
            { upsert: true, new: true, runValidators: true }
        );

        successResponse(res, 200, "Timetable saved successfully!", timetable);
    } catch (e) {
        console.error("Error saving timetable grid:", e);
        next(e);
    }
});

exports.deleteTimetableGrid = asyncHandler(async (req, res, next) => {
    try {
        const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;
        const { classArmId } = req.params;
        const type = req.query.type || "class";

        await timetableGridModel.findOneAndDelete({ classArmId, schoolId, type });

        successResponse(res, 200, "Timetable deleted successfully!", null);
    } catch (e) {
        console.error("Error deleting timetable grid:", e);
        next(e);
    }
});