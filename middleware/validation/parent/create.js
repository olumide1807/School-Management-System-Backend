const Joi = require("joi");

const schema = Joi.object({
    title: Joi.string().required(),
    firstName: Joi.string().required(),
    surName: Joi.string().required(),
    gender: Joi.string().valid("male", "female").required(),
    maritalStatus: Joi.string().valid("single","married").required(),
    email: Joi.string().email().required(),
    phoneNumber: Joi.string().required(),
    occupation: Joi.string().required(),
    address: Joi.object({
        number: Joi.number().required(),
        street: Joi.string().required(),
        city: Joi.string().required(),
        state: Joi.string().required(),
        postalCode: Joi.string().required(),
        country: Joi.string().required()
    }),
    country: Joi.string().required(),
    studentID: Joi.string(),
    relationship: Joi.string()
});

module.exports = (data) => {
    return schema.validate(data, { abortEarly: false });
}