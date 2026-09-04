const asyncHandler = require("../middleware/async");
const ErrorResponse = require("../utils/errorResponse");
const { successResponse } = require("../utils/successResponse");
const { schoolSettingsModel } = require("../models");

const getSchoolId = (req) =>
    req.user.schoolName ? req.user.id : req.user.schoolId;

// GET /settings — get school settings (creates default if none exist)
exports.getSchoolSettings = asyncHandler(async (req, res, next) => {
    try {
        const schoolId = getSchoolId(req);
        let settings = await schoolSettingsModel.findOne({ schoolId });

        if (!settings) {
            settings = await schoolSettingsModel.create({ schoolId });
        }

        successResponse(res, 200, null, settings);
    } catch (e) {
        console.error("Error getting school settings:", e);
        next(e);
    }
});

// PUT /settings — update school settings (upsert)
exports.updateSchoolSettings = asyncHandler(async (req, res, next) => {
    try {
        const schoolId = getSchoolId(req);
        const updates = req.body;

        const settings = await schoolSettingsModel.findOneAndUpdate(
            { schoolId },
            { $set: updates, schoolId },
            { upsert: true, new: true, runValidators: true }
        );

        successResponse(res, 200, "Settings updated successfully", settings);
    } catch (e) {
        console.error("Error updating school settings:", e);
        next(e);
    }
});