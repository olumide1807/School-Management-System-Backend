const { GeneratePassword } = require("./index");   // or wherever it lives
const { generatePortalPassword } = require("./generatePortalPassword");

const createParent = async (email, schoolId, model, data) => {
    // check if the parent exists in the school by email address
    const parent = await model.findOne({
        email,
        schoolId
    });

    if (parent) {
        return null;
    }

    // The only place a parent's initial password is generated. Callers read
    // it back from newParent.plainPassword, so what they report is exactly
    // what was hashed — they must not set data.password themselves.
    const plainPassword = generatePortalPassword();
    data.password = await GeneratePassword(plainPassword);

    // create a new parent using the tabled info
    const newParent = await model.create(data);
    newParent.plainPassword = plainPassword;   // in memory only, not saved
    return newParent;
};

module.exports = { createParent }