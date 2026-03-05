const Joi = require("joi");

const schema = Joi.object({
    termId: Joi.string().required(),
    currency: Joi.string().required(),
    classArms: Joi.array().items(Joi.string().required()).required(),
    fees: Joi.array().items(Joi.object({
        description: Joi.string().required(),
        amount: Joi.string().required()
    }).required()).required()
});

module.exports = (data) => {
    return schema.validate(data, { abortEarly: false });
}