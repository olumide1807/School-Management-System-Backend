const Joi = require('joi');

const loginSuperAdminValidationSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(7).required()
});

const validateLoginSuperAdmin = (data) => {
    return loginSuperAdminValidationSchema.validate(data, { abortEarly: false });
};

module.exports = validateLoginSuperAdmin