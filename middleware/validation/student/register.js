const Joi = require("joi");

const schema = Joi.object({
    classArmId: Joi.string().required(),
    gender: Joi.string().valid("male", "female").required(),
    surName: Joi.string().required(),
    firstName: Joi.string().required(),
    dateOfBirth: Joi.date().required(),
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
    // Optional fields
    email: Joi.string().email().allow('', null),
    studentID: Joi.string().allow('', null),
    otherName: Joi.string().allow('', null),
    phoneNumber: Joi.string().allow('', null),
    bloodGroup: Joi.string().allow('', null),
    religion: Joi.string().allow('', null),
    nationality: Joi.string().allow('', null),
    previousSchool: Joi.string().allow('', null),
    lastClassAttended: Joi.string().allow('', null),
    reasonForLeaving: Joi.string().allow('', null),
    admissionDate: Joi.date().allow(null),
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
    // Parent fields (all optional)
    parentID: Joi.string().allow('', null),
    relationship: Joi.string().allow('', null),
    parentTitle: Joi.string().allow('', null),
    parentFirstName: Joi.string().allow('', null),
    parentSurName: Joi.string().allow('', null),
    parentGender: Joi.string().allow('', null),
    maritalStatus: Joi.string().allow('', null),
    parentEmail: Joi.string().email().allow('', null),
    parentPhoneNumber: Joi.string().allow('', null),
    parentCountry: Joi.string().allow('', null),
    occupation: Joi.string().allow('', null),
    parentAddress: Joi.object({
        number: Joi.number(),
        street: Joi.string(),
        city: Joi.string(),
        state: Joi.string(),
        postalCode: Joi.string().allow('', null),
        country: Joi.string()
    }).allow(null),
});

const validate = (data) => {
    return schema.validate(data, { abortEarly: false });
};

module.exports = validate;