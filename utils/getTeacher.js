const {
    staffModel,
} = require("../models");
const ErrorResponse = require("../utils/errorResponse");

async function getTeacher(subjectTeacherEmail, schoolId, next) {
    const teacher = await staffModel.findOne({
        email: subjectTeacherEmail,
        schoolId,
        role: {$in: ["academic"]},
    });

    if (!teacher) {
        return next(
            new ErrorResponse(
                `The staff with this email: ${subjectTeacherEmail} is not an academic staff or is not found in your school 😢`
            )
        );
    }

    return teacher;
}

module.exports = {getTeacher}