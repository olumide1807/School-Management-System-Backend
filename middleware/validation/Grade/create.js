const Joi = require("joi");

const schema = Joi.object({
    name: Joi.string().required(),
    grades: Joi.array().items(Joi.object({
        scoreRange: Joi.object({
            from: Joi.number().required(),
            to: Joi.number().required()
        }).required(),
        grade: Joi.string().required(),
        remark: Joi.string().required(),
        color: Joi.string().required()
    }).required()).required()
});

module.exports = (data) => {
    return schema.validate(data, { abortEarly: false });
}