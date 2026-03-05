const Joi = require('joi');

// Define the schema for Joi validation
const superAdminValidationSchema = Joi.object({
  firstName: Joi.string(),
  lastName: Joi.string(),
  emailAddress: Joi.string().email(),
  phoneNumber: Joi.string(),
  schoolName: Joi.string(),
  schoolEmailAddress: Joi.string().email(),
  schoolAddress: Joi.object({
    number: Joi.number(),
    street: Joi.string(),
    city: Joi.string(),
    state: Joi.string(),
    postalCode: Joi.string(),
    country: Joi.string(),
  }),
});

// Validate the request body against the schema
const validateSuperAdmin = (data) => {
  return superAdminValidationSchema.validate(data, { abortEarly: false });
};

module.exports = validateSuperAdmin