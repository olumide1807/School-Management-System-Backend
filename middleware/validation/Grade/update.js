const Joi = require("joi");

const schema = Joi.object({
    name: Joi.string().required(),
    grades: Joi.array().items(Joi.object({
        scoreRange: Joi.object({
            from: Joi.number(),
            to: Joi.number()
        }),
        grade: Joi.string(),
        remark: Joi.string(),
        color: Joi.string()
    }))
});

module.exports = (data) => {
    return schema.validate(data, { abortEarly: false });
}