const Joi = require("joi");

const superAdminValidation = Joi.object({
  firstName: Joi.string(),
  lastName: Joi.string(),
  emailAddress: Joi.string().email(),
  phoneNumber: Joi.string(),
  schoolName: Joi.string(),
  schoolMotto: Joi.string(),
  schoolEmailAddress: Joi.string().email(),
  schoolAddress: Joi.object({
    number: Joi.number(),
    street: Joi.string(),
    city: Joi.string(),
    state: Joi.string(),
    postalCode: Joi.string(),
    country: Joi.string(),
  }),
  schoolInitials: Joi.string(),
  schoolAccountDetails: Joi.object({
    accountNumber: Joi.string().min(9).max(11),
    accountName: Joi.string(),
    bankName: Joi.string(),
    phoneNumber: Joi.string(),
  }),
}).or(
  "firstName",
  "lastName",
  "emailAddress",
  "phoneNumber",
  "schoolName",
  "schoolMotto",
  "schoolEmailAddress",
  "schoolAddress",
  "schoolInitials",
  "schoolAccountDetails"
);

function validate(data) {
  return superAdminValidation.validate(data);
}

module.exports = validate;
