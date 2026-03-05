const Joi = require('joi');

// Define a schema for the staff model
const schema = Joi.object({
    armName: Joi.string().required(),
});

const validate = (data) => {
  return schema.validate(data, { abortEarly: false });
}

module.exports = validate;