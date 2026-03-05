const { timeTableModel } = require("../models");
const ErrorResponse = require("../utils/errorResponse");

async function checkTimetableEntryExistence(
    classArmId,
    schoolId,
    daysOfTheWeek,
    startTime,
    endTime,
    timetableEntryId = null,
    type = null,
    next,
    Type = null
) {
    let query = {
        classArmId,
        schoolId,
        type: Type ? Type : "class",
        daysOfTheWeek: { $in: daysOfTheWeek || [] },
        $or: [
            {
                $and: [
                    { startTime: { $lte: startTime } },
                    { endTime: { $gte: startTime } }
                ]
            },
            {
                $and: [
                    { startTime: { $lte: endTime } },
                    { endTime: { $gte: endTime } }
                ]
            }
        ]
    };

    if (timetableEntryId) {
        query._id = (type === "excluding") ? { $ne: timetableEntryId } : timetableEntryId;
    }

    const overlappingTimetableEntry = await timeTableModel.findOne(query);

    if (overlappingTimetableEntry) {
        return true;
    }

    return false;

    // The requested timetable entry overlaps with an existing entry! 😢
}

module.exports = { checkTimetableEntryExistence };