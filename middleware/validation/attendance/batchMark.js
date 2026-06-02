const Joi = require("joi");

// Records must have a status (present or absent)
// Frontend filters out unmarked students before sending — never send "not marked" to backend
const schema = Joi.object({
    classArmId: Joi.string().required(),
    date: Joi.date().required(),
    records: Joi.array().items(
        Joi.object({
            studentId: Joi.string().required(),
            status: Joi.string().valid("present", "absent").required()
        })
    ).min(1).required()
});

module.exports = (data) => schema.validate(data, { abortEarly: false });