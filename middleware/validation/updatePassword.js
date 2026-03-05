const Joi = require('joi');

const schema = Joi.object({
    currentPassword: Joi.string().min(7).required(),
    newPassword: Joi.string().min(7).required()
});

// Validate the request body against the schema
const validateUpdatePassword = (data) => {
    return schema.validate(data, { abortEarly: false })
};

module.exports = validateUpdatePassword