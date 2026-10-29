const Joi = require('joi');

// The reset token issued by verifyOTP, and the new password. Nothing else:
// the token alone identifies the account.
const schema = Joi.object({
    token: Joi.string().hex().length(64).required(),
    password: Joi.string().min(7).required()
});

// Validate the request body against the schema
const validate = (data) => {
    return schema.validate(data, { abortEarly: false })
};

module.exports = validate;