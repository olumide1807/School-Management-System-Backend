const asyncHandler = require("../middleware/async");
const ErrorResponse = require("../utils/errorResponse");
const { successResponse } = require("../utils/successResponse");
const { schoolSettingsModel, SuperAdminModel, staffModel } = require("../models");

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

// GET /settings/school-info — branding and principal, readable by all staff.
// School identity lives on the super admin record; this exposes just the
// public parts so report cards can be printed by teachers and admins.
exports.getSchoolInfo = asyncHandler(async (req, res, next) => {
    try {
        const schoolId = getSchoolId(req);

        const [school, settings] = await Promise.all([
            SuperAdminModel
                .findById(schoolId)
                .select("schoolName schoolInitials schoolMotto schoolAddress schoolEmailAddress schoolLogo logo"),
            schoolSettingsModel.findOne({ schoolId }),
        ]);

        if (!school) {
            return next(new ErrorResponse("School not found", 404));
        }

        let principal = null;
        if (settings?.principalId) {
            const p = await staffModel
                .findOne({ _id: settings.principalId, schoolId })
                .select("title firstName surname otherName profilePicture");
            if (p) {
                principal = {
                    _id: p._id,
                    name: `${p.title ? p.title + " " : ""}${p.firstName || ""} ${p.surname || ""}`.trim(),
                };
            }
        }

        successResponse(res, 200, null, {
            school: {
                name: school.schoolName || "",
                initials: school.schoolInitials || "",
                motto: school.schoolMotto || "",
                email: school.schoolEmailAddress || "",
                address: school.schoolAddress || null,
                logo: school.schoolLogo || school.logo || null,
            },
            principal,
        });
    } catch (e) {
        console.error("Error getting school info:", e);
        next(e);
    }
});