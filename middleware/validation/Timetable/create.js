const Joi = require('joi');

// Define a schema for the staff model
const schema = Joi.object({
    type: Joi.string().valid("class", "test", "exam").required(),
    classArmId: Joi.string().required()
});

const validate = (data) => {
    return schema.validate(data, { abortEarly: false });
};

module.exports = validate;