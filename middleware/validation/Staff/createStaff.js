const Joi = require('joi');

const schema = Joi.object({
  title: Joi.string().valid("Mr", "Mrs", "Miss", "Dr", "Prof").allow('', null),
  firstName: Joi.string().required(),
  surname: Joi.string().required(),
  otherName: Joi.string().allow('', null),
  gender: Joi.string().valid("male", "female", "prefer not to say").allow('', null),
  maritalStatus: Joi.string().valid("single", "married", "divorced", "widowed").allow('', null),
  emailAddress: Joi.string().email().required(),
  phoneNumber: Joi.string().allow('', null),
  country: Joi.string().allow('', null),
  stateOfOrigin: Joi.string().allow('', null),
  localGovernmentArea: Joi.string().allow('', null),
  religion: Joi.string().allow('', null),
  nextOfKinFirstName: Joi.string().allow('', null),
  nextOfKinSurname: Joi.string().allow('', null),
  nextOfKinPhoneNumber: Joi.string().allow('', null),
  nextOfKinRelationship: Joi.string().allow('', null),
  homeAddress: Joi.string().allow('', null),
  staffType: Joi.string().valid("academic", "non-academic").default("academic"),
  isAdmin: Joi.boolean().default(false),
  salary: Joi.string().allow('', null),
  employmentDate: Joi.date().allow(null, ''),
  // New fields
  qualifications: Joi.array().items(
    Joi.object({
      degree: Joi.string().allow('', null),
      fieldOfStudy: Joi.string().allow('', null),
      institution: Joi.string().allow('', null),
      yearGraduated: Joi.number().allow(null),
      certificateUrl: Joi.string().allow('', null)
    })
  ).allow(null),
  assignedSubjects: Joi.array().items(Joi.string()).allow(null),
  assignedClasses: Joi.array().items(Joi.string()).allow(null)
});

const validate = (data) => {
  return schema.validate(data, { abortEarly: false });
};

module.exports = validate;