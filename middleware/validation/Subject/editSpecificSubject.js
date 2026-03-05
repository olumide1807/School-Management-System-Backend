const Joi = require("joi")

const schema = Joi.object({
    subjectTeacherId: Joi.string().min(3).required(),
})

const validateSpecificSubject = (data) => {
    return schema.validate(data, { abortEarly: false })
}

module.exports = validateSpecificSubject;