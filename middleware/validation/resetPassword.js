const Joi = require('joi');

const schema = Joi.object({
    password: Joi.string().min(7).required()
});

// Validate the request body against the schema
const validate = (data) => {
    return schema.validate(data, { abortEarly: false })
};

module.exports = validate;