const Joi = require("joi");

const schema = Joi.object({
    assessments: Joi.array().items(Joi.object({
        name: Joi.string().required(),
        score: Joi.string().required()
    }).required()).required()
});

const validate = (data) => {
    return schema.validate(data, { abortEarly: false });
};

module.exports = validate;