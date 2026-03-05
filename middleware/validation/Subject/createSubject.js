const Joi = require("joi")

const subjectValidationSchema = Joi.object({
    subjectName: Joi.string().min(3).required(),
    classArmIds: Joi.array().items(Joi.string()),
})

const validateSubject = (data) => {
    return subjectValidationSchema.validate(data, { abortEarly: false })
}

module.exports = validateSubject;
