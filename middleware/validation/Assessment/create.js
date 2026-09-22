const Joi = require("joi");

const schema = Joi.object({
    classLevel: Joi.string(),
    assessments: Joi.array().items(Joi.object({
        name: Joi.string().required(),
        maxScore: Joi.number().min(1).required(),
        order: Joi.number(),
        source: Joi.string().valid("manual", "attendance")
    })).min(1).required()
});

const validate = (data) => {
    return schema.validate(data, { abortEarly: false });
};

module.exports = validate;