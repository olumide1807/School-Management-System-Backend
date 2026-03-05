const joi = require("joi");

const schema = joi.object({
    sessionName: joi.string().required(),
    currentSession: joi.boolean(),
    term: joi.array().items(joi.object({
        termName: joi.string().required(),
        termStartDate: joi.date().required(),
        termEndDate: joi.date().required(),
        nextTermStartDate: joi.date().required(),
        currentTerm: joi.boolean()
    })).required()
});

const validate = (data) => {
    return schema.validate(data, { abortEarly: false });
}

module.exports = validate 
    


