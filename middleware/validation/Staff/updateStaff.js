const Joi = require('joi');

const schema = Joi.object({
  name: Joi.string(),
  email: Joi.string().email(),
  qualifications: Joi.array().items(Joi.string()),
  dateOfBirth: Joi.date(),
  phoneNumber: Joi.string(),
  address: Joi.object({
    number: Joi.number(),
    street: Joi.string(),
    city: Joi.string(),
    state: Joi.string(),
    postalCode: Joi.string(),
    country: Joi.string(),
  }),
  emergencyContact: Joi.object({
    name: Joi.string(),
    phoneNumber: Joi.string(),
  }),
  sex: Joi.string().valid('Male', 'Female', 'Other'),
}).or(
  'name',
  'email',
  'qualifications',
  'dateOfBirth',
  'phoneNumber',
  'address',
  'emergencyContact',
  'sex'
);


const validate = (data) => {
    return schema.validate(data, {abortEarly: false})
};

module.exports = validate;