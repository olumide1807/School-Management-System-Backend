const Joi = require("joi");

const schema = Joi.object({
    firstName: Joi.string(),
    surName: Joi.string(),
    otherName: Joi.string().allow('', null),
    gender: Joi.string().valid("male", "female"),
    dateOfBirth: Joi.date(),
    email: Joi.string().email().allow('', null),
    phoneNumber: Joi.string().allow('', null),
    country: Joi.string(),
    stateOfOrigin: Joi.string(),
    localGovernmentArea: Joi.string(),
    address: Joi.object({
        number: Joi.number(),
        street: Joi.string().allow('', null),
        city: Joi.string().allow('', null),
        state: Joi.string().allow('', null),
        postalCode: Joi.string().allow('', null),
        country: Joi.string().allow('', null)
    }),
    bloodGroup: Joi.string().allow('', null),
    religion: Joi.string().allow('', null),
    nationality: Joi.string().allow('', null),
    previousSchool: Joi.string().allow('', null),
    lastClassAttended: Joi.string().allow('', null),
    reasonForLeaving: Joi.string().allow('', null),
    medicalInfo: Joi.object({
        allergies: Joi.string().allow('', null),
        disabilities: Joi.string().allow('', null),
        medicalConditions: Joi.string().allow('', null),
    }).allow(null),
    emergencyContact: Joi.object({
        name: Joi.string().allow('', null),
        phone: Joi.string().allow('', null),
        relationship: Joi.string().allow('', null),
    }).allow(null),
}).min(1);

const validate = (data) => {
    return schema.validate(data, { abortEarly: false })
}

module.exports = validate;