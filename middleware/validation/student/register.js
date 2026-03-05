const Joi = require("joi");

const schema = Joi.object({
    classArmId: Joi.string().required(),
    gender: Joi.string().valid("male", "female").required(),
    surName: Joi.string().required(),
    email: Joi.string().email(),
    dateOfBirth: Joi.date().required(),
    studentID: Joi.string(),
    firstName: Joi.string().required(),
    otherName: Joi.string(),
    phoneNumber: Joi.string(),
    country: Joi.string().required(),
    stateOfOrigin: Joi.string().required(),
    localGovernmentArea: Joi.string().required(),
    address: Joi.object({
        number: Joi.number(),
        street: Joi.string(),
        city: Joi.string(),
        state: Joi.string(),
        postalCode: Joi.string(),
        country: Joi.string()
    }).required(),
    parentID: Joi.string(),
    relationship: Joi.string().required(),
    parentTitle: Joi.string(),
    parentFirstName: Joi.string(),
    parentSurName: Joi.string(),
    parentGender: Joi.string(),
    maritalStatus: Joi.string(),
    parentEmail: Joi.string().email(),
    parentPhoneNumber: Joi.string(),
    parentCountry: Joi.string(),
    occupation: Joi.string(),
    parentAddress: Joi.object({
        number: Joi.number(),
        street: Joi.string(),
        city: Joi.string(),
        state: Joi.string(),
        postalCode: Joi.string(),
        country: Joi.string()
    })
});

const validate = (data) => {
    return schema.validate(data, { abortEarly: false });
};

module.exports = validate;