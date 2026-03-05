const Joi = require("joi");

const schema = Joi.object({
    title: Joi.string().min(7),
    description: Joi.string().min(20),
    startDate: Joi.date(),
    endDate: Joi.date(),
    visibleTo: Joi.array().items(Joi.string().valid("staff", "student")),
    important: Joi.boolean()
}).or('title', 'description', 'startDate', 'endDate', 'visibleTo', 'important')

const validate = (data) => {
    return schema.validate(data, { abortEarly: false });
};

module.exports = validate;