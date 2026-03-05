const Joi = require("joi");

const schema = Joi.object({
    status: Joi.boolean().required()
});

const validate = (data) => {
    return schema.validate(data, { abortEarly: false });
};

module.exports = validate;