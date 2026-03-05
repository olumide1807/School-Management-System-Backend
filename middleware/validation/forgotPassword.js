const Joi = require('joi');

// Define the validation schema for forgot password
const schema = Joi.object({
    email: Joi.string().email().required()
});

const validateSchema = (data) => {
    return schema.validate(data, { abortEarly: false });
};

module.exports = validateSchema