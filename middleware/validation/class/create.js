const Joi = require('joi');

// Define a schema for the staff model
const classSchema = Joi.object({
  levelName: Joi.string().required(),
  levelShortName: Joi.string().required(),
  armNames: Joi.array().items(Joi.string())
});

const validate = (data) => {
  return classSchema.validate(data, { abortEarly: false });
}

module.exports = validate;