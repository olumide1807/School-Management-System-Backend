const Joi = require("joi");

const schema = Joi.object({
    staffId: Joi.string().required(),
    sessionId: Joi.string().required(),
    term: Joi.string().required().valid("first", "second", "third"),
    date: Joi.date().required().default(Date.now()),
    status: Joi.boolean().required(),
    staffType: Joi.string().required().valid("admin", "academic", "non-academic")
});

const validate = (data) => {
    return schema.validate(data, { abortEarly: false });
};

module.exports = validate;