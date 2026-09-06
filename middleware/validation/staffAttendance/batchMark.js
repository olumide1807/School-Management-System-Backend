const Joi = require("joi");

const schema = Joi.object({
    date: Joi.date().required(),
    records: Joi.array().items(
        Joi.object({
            staffId: Joi.string().required(),
            // status sent from frontend: "present" | "absent" | "on_leave"
            // "late" is auto-derived by backend — frontend never sends "late" directly
            status: Joi.string().valid("present", "absent", "on_leave").required(),
            // "HH:MM" 24-hour format, only required when status is "present"
            checkInTime: Joi.string().pattern(/^\d{2}:\d{2}$/).allow(null, "").optional(),
            note: Joi.string().allow("", null).optional()
        })
    ).min(1).required()
});

module.exports = (data) => schema.validate(data, { abortEarly: false });