const Joi = require("joi");

const schema = Joi.object({
    email: Joi.string().email(),
    staffId: Joi.string(),
    password: Joi.string().required()
}).xor('email', 'staffId').and('email', 'password');

const validate = (data) => {
    return schema.validate(data, { abortEarly: false });
}

module.exports = validate;
