const Joi = require("joi");

const schema = Joi.object({
    parentId: Joi.string().required(),
    relationship: Joi.string().required(),
});

const validate = (data) => {
    return schema.validate(data, { abortEarly: false });
};

module.exports = validate;