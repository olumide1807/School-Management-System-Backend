const Joi = require('joi');

// Define a schema for the staff model
const schema = Joi.object({
  title: Joi.string().valid("Mr", "Mrs"),
  firstName: Joi.string(),
  surname: Joi.string(),
  otherName: Joi.string(),
  gender: Joi.string().valid("male", "female", "prefer not to say"),
  maritalStatus: Joi.string().valid("single", "married"),
  emailAddress: Joi.string().email().required(),
  phoneNumber: Joi.string(),
  country: Joi.string(),
  stateOfOrigin: Joi.string(),
  localGovernmentArea: Joi.string(),
  religion: Joi.string(),
  nextOfKinFirstName: Joi.string(),
  nextOfKinSurname: Joi.string(), 
  nextOfKinPhoneNumber: Joi.string(),
  nextOfKinRelationship: Joi.string(),
  homeAddress: Joi.string(),
  staffType: Joi.string().valid("academic", "non-academic"),
  salary: Joi.string(), 
  employmentDate: Joi.date(),
  assignedSubjects: Joi.array().items(Joi.string()),
  assignedClasses: Joi.array().items(Joi.string())
});

const validate = (data) => {
  return schema.validate(data, { abortEarly: false });
};

module.exports = validate;