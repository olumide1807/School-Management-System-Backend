const {
    classArmModel
  } = require("../models");

async function getClassArm(schoolId, userInputClassDisplayName, next) {
  const classArm = await classArmModel.findOne({
    displayName: {
      $regex: new RegExp("^" + userInputClassDisplayName + "$", "i"),
    },
    schoolId,
  });

  if (!classArm) {
    return next(
      new ErrorResponse(
        `Class arm ${userInputClassDisplayName} does not exist! 😢`,
        404
      )
    );
  }

  return classArm;
}

module.exports = { getClassArm };