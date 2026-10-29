const Joi = require('joi');

// Define the validation schema for forgot password
const schema = Joi.object({
    // Six digits (utils/generateRandomOTP.js)
    otp: Joi.number().integer().min(100000).max(999999).required()
});

const validateSchema = (data) => {
    return schema.validate(data, { abortEarly: false });
};

module.exports = validateSchema