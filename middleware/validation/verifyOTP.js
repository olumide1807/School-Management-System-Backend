const Joi = require('joi');

// Define the validation schema for forgot password
const schema = Joi.object({
    otp: Joi.number().required()
});

const validateSchema = (data) => {
    return schema.validate(data, { abortEarly: false });
};

module.exports = validateSchema