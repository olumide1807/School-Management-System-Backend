const { periodTimeModel } = require("../models");
const ErrorResponse = require("../utils/errorResponse");

const getPeriodTime = require("./getPeriodTime");

async function getOrSetPeriodTime(schoolId, classArmDisplayName, next, type = null) {
  let periodTime = await periodTimeModel.findOne({
    schoolId,
    classArmDisplayName,
    type: type ? type : "class"
  });

  if (!periodTime) {
    periodTime = await getPeriodTime(schoolId, classArmDisplayName, type);
  }

  if (!periodTime) {
    return next(
      new ErrorResponse(
        "You have not set the period time! Please do so 🙂",
        400
      )
    );
  }

  return periodTime;
}

module.exports = { getOrSetPeriodTime };
