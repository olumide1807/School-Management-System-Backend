const Joi = require("joi");
const { parseFeeAmount } = require("../../../utils/feeAmount");

// A number, or a string that is exactly a plain number, of zero or more
// with at most two decimals. Converted to a Number; anything else
// ("50,000", "-5", "1e3", "12.345") is rejected rather than coerced.
const feeAmount = (value, helpers) => {
    const minor = parseFeeAmount(value);
    if (minor === null) return helpers.error("feeAmount.invalid");
    return minor / 100;
};

const schema = Joi.object({
    termId: Joi.string().required(),
    currency: Joi.string().required(),
    classArms: Joi.array().items(Joi.string().required()).required(),
    fees: Joi.array().items(Joi.object({
        description: Joi.string().required(),
        amount: Joi.any().required().custom(feeAmount).messages({
            "feeAmount.invalid":
                "Fee amounts must be a plain number of zero or more, with at most two decimal places (e.g. 50000 or 1500.50), with no commas or currency symbols.",
        }),
    }).required()).required()
});

module.exports = (data) => {
    return schema.validate(data, { abortEarly: false });
}
