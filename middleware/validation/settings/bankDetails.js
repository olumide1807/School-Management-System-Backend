const Joi = require("joi");

// Only these four fields; anything else in the body is rejected. Every
// field is optional so the details can be filled in over time, and an
// empty string clears one. Values must be strings: an account number sent
// as a Number has already lost any leading zero.
const schema = Joi.object({
    bankName: Joi.string().trim().allow("").max(100),
    accountName: Joi.string().trim().allow("").max(100),
    accountNumber: Joi.string().trim().allow("").pattern(/^\d{10}$/).messages({
        "string.pattern.base": "Account number must be exactly 10 digits, with no spaces or other characters",
        "string.base": "Account number must be sent as text, so a leading zero isn't lost",
    }),
    paymentInstructions: Joi.string().trim().allow("").max(500),
}).min(1).messages({
    "object.min": "Send at least one bank detail to update",
    "object.unknown": "{{#label}} is not a bank detail",
});

module.exports = (data) => schema.validate(data, { abortEarly: true });
