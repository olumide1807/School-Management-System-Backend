const {
    specificSubjectModel,
  } = require("../models");
  const moment = require("moment");

async function getSubject(classArmId, schoolId, specificSubjectId, next) {
  const subject = await specificSubjectModel.findOne({
    _id: specificSubjectId,
    classArmId,
    schoolId,
  });

  if (!subject) {
    return next(
      new ErrorResponse(
        `Subject has not been added to the specific class! 😢. Please check if the specificSubject exists`,
        404
      )
    );
  }

  return subject;
}


module.exports = {
    getSubject
}