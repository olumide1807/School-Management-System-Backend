const joi = require("joi");

const schema = joi.object({
    termName: joi.string(),
    termStartDate: joi.date(),
    termEndDate: joi.date(),
    nextTermStartDate: joi.date(),
    currentTerm: joi.boolean()
}).or(
    "termName",
    "termStartDate",
    "termEndDate",
    "nextTermStartDate",
    "currentTerm"
);

const validate = (data) => {
    return schema.validate(data, { abortEarly: false });
}

module.exports = validate 