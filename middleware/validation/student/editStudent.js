const Joi = require("joi");

const schema = Joi.object({
    gender: Joi.string().valid("male", "female"),
    phoneNumber: Joi.string(),
    country: Joi.string(),
    localGovernmentArea: Joi.string(),
    address: Joi.object({
        number: Joi.number(),
        street: Joi.string(),
        city: Joi.string(),
        state: Joi.string(),
        postalCode: Joi.string(),
        country: Joi.string()
    }),
    email: Joi.string().email(),
    dateOfBirth: Joi.date(),
    stateOfOrigin: Joi.string()
}).or(
    "gender",
    "phoneNumber",
    "country",
    "localGovernmentArea",
    "address",
    "email",
    "dateOfBirth",
    "stateOfOrigin"
);

const validate = (data) => {
    return schema.validate(data, { abortEarly: false })
}

module.exports = validate;