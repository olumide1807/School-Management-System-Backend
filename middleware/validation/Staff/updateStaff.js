const Joi = require('joi');

// Fields a staff member may change on their own record.
// Deliberately excludes emailAddress (login identifier), staffType,
// salary, employmentDate, isAdmin, staffID and schoolId — those are
// the school's decisions, changed only via admin-update.
const schema = Joi.object({
  title: Joi.string().valid("Mr", "Mrs", "Miss", "Dr", "Prof").allow('', null),
  firstName: Joi.string(),
  surname: Joi.string(),
  otherName: Joi.string().allow('', null),
  gender: Joi.string().valid("male", "female", "prefer not to say"),
  maritalStatus: Joi.string().valid("single", "married"),
  phoneNumber: Joi.string().allow('', null),
  country: Joi.string().allow('', null),
  stateOfOrigin: Joi.string().allow('', null),
  localGovernmentArea: Joi.string().allow('', null),
  religion: Joi.string().allow('', null),
  homeAddress: Joi.string().allow('', null),
  nextOfKinFirstName: Joi.string().allow('', null),
  nextOfKinSurname: Joi.string().allow('', null),
  nextOfKinPhoneNumber: Joi.string().allow('', null),
  nextOfKinRelationship: Joi.string().allow('', null),
  profilePicture: Joi.string().allow('', null),
}).min(1);

const validate = (data) => schema.validate(data, { abortEarly: false });

module.exports = validate;