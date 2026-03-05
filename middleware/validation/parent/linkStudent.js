const Joi = require("joi");

const schema = Joi.object({
    studentID: Joi.string().required(),
    relationship: Joi.string().required()
})

module.exports = (data) => {
    return schema.validate(data, {abortEarly: false})
}