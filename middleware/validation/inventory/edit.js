const Joi = require("joi");

const schema = Joi.object({
    name: Joi.string().trim(),
    category: Joi.string().trim().allow(""),
    description: Joi.string().trim().allow(""),
    quantity: Joi.number().min(0),
    minQuantity: Joi.number().min(0),
    price: Joi.number().min(0),
    supplier: Joi.string().trim().allow(""),
    dateBought: Joi.date().allow(null, "")
}).or(
    "name", "category", "description", "quantity",
    "minQuantity", "price", "supplier", "dateBought"
);

module.exports = (data) => schema.validate(data, { abortEarly: false });
