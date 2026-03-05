const moment = require("moment");
const ErrorResponse = require("../utils/errorResponse");

function validateTimeDifference(startTime, endTime, periodInterval, next) {
    const startTimeObj = moment(startTime, "h:mmA");
    const endTimeObj = moment(endTime, "h:mmA");

    const timeDifference = endTimeObj.diff(startTimeObj, "minutes");

    if (endTimeObj.isSameOrBefore(startTimeObj)) {
        return next(new ErrorResponse(`The endTime must be later than startTime 😢`, 400));
    }

    if (periodInterval && timeDifference !== periodInterval) {
        return next(new ErrorResponse(`The difference between startTime and endTime must be equal to ${periodInterval} minutes 😢`, 400));
    }

    if (!periodInterval && timeDifference < 30) {
        return next(new ErrorResponse("The difference between startTime and endTime must be at least 30 minutes 😢", 400));
    }
}

module.exports = validateTimeDifference;