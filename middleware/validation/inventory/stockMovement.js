const Joi = require("joi");

const schema = Joi.object({
    type: Joi.string().valid("restock", "consumed", "damaged", "lost", "returned").required(),
    quantity: Joi.number().integer().min(1).required(),
    note: Joi.string().trim().allow("").optional()
});

module.exports = (data) => schema.validate(data, { abortEarly: false });
