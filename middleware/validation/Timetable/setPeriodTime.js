const Joi = require("joi");

const schema = Joi.object({
    startTimeOfTheDay: Joi.string().required(),
    endTimeOfTheDay: Joi.string().required(),
    periodInterval: Joi.number().required().valid(30, 60, 45, 50, 60, 90).required(),
    day: Joi.array().items(Joi.string().valid("monday", "tuesday", "wednesday", "thursday", "friday")).required(),
    classArmDisplayNames: Joi.array().items(Joi.string()),
    type: Joi.string().valid("class", "test", "exam")
});

const validate = (data) => {
    return schema.validate(data, { abortEarly: false });
}

module.exports = validate;