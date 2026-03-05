const Joi = require("joi");

const schema = Joi.object({
    title: Joi.string(),
    firstName: Joi.string(),
    surName: Joi.string(),
    gender: Joi.string().valid("male", "female"),
    maritalStatus: Joi.string().valid("single","married"),
    email: Joi.string().email(),
    phoneNumber: Joi.string(),
    occupation: Joi.string(),
    address: Joi.object({
        number: Joi.number(),
        street: Joi.string(),
        city: Joi.string(),
        state: Joi.string(),
        postalCode: Joi.string(),
        country: Joi.string()
    }),
}).or(
    "title",
    "firstName",
    "surName",
    "gender",
    "maritalStatus",
    "email",
    "phoneNumber",
    "occupation",
    "address"
)

module.exports = (data) => {
    return schema.validate(data, { abortEarly: false });
}