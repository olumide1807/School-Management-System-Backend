const Joi = require("joi");

const schema = Joi.object({
    name: Joi.string().trim().required(),
    category: Joi.string().trim().allow("").optional(),
    description: Joi.string().trim().allow("").optional(),
    quantity: Joi.number().min(0).required(),
    minQuantity: Joi.number().min(0).optional(),
    price: Joi.number().min(0).required(),
    supplier: Joi.string().trim().allow("").optional(),
    dateBought: Joi.date().optional().allow(null, "")
});

module.exports = (data) => schema.validate(data, { abortEarly: false });
