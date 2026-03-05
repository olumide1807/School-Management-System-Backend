const { periodTimeModel, classArmModel } = require("../models");

async function getPeriodTime(schoolId, classArmDisplayName = null, classArmId = null, type = null) {
    const buildQuery = (displayNames) => ({
        schoolId,
        classArmDisplayNames: { $in: displayNames ? (displayNames || "all") : "all" },
        type: type ? type : "class"
    });

    let query;

    if (classArmDisplayName) {
        query = buildQuery(classArmDisplayName);
    } else if (classArmId) {
        const classArm = await classArmModel.findById(classArmId);
        query = buildQuery(classArm ? classArm.displayName : null);
    }

    const period = await periodTimeModel.findOne(query || { schoolId });

    return period ? period : await periodTimeModel.findOne({ schoolId });
}

module.exports = getPeriodTime;
