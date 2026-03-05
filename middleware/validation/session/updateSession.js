const joi = require("joi");

const schema = joi.object({
    sessionName: joi.string(),
    currentSession: joi.boolean(),
}).or(
    "sessionName",
    "currentSession"
);

const validate = (data) => {
    return schema.validate(data, { abortEarly: false });
}

module.exports = validate 
    


