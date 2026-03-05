const Joi = require('joi');

// Define a schema for the staff model
const classSchema = Joi.object({
  levelName: Joi.string(),
  levelShortName: Joi.string(),
}).or('levelName', 'levelShortName')

const validate = (data) => {
  return classSchema.validate(data, { abortEarly: false });
}

module.exports = validate;