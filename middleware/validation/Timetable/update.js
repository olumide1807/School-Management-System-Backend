const Joi = require('joi');

// Define a schema for the staff model
const schema = Joi.object({
    daysOfTheWeek: Joi.array().items(Joi.string().valid("monday", "tuesday", "wednesday", "thursday", "friday")).required(),
    startTime: Joi.string().required(),
    endTime: Joi.string().required(),
});

const validate = (data) => {
    return schema.validate(data, { abortEarly: false });
}

module.exports = validate;