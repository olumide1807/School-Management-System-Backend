const Joi = require("joi");

const schema = Joi.object({
    title: Joi.string().min(7).required(),
    description: Joi.string().min(20).required(),
    startDate: Joi.date(),
    endDate: Joi.date(),
    visibleTo: Joi.array().items(Joi.string().valid('staff', 'student')),
    important: Joi.boolean()
});

const validate = (data) => {
    return schema.validate(data, { abortEarly: false });
};

module.exports = validate;