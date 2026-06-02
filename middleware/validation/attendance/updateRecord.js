const Joi = require("joi");

const schema = Joi.object({
    status: Joi.string().valid("present", "absent").required()
});

module.exports = (data) => schema.validate(data, { abortEarly: false });
