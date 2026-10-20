const crypto = require("crypto");
const { GeneratePassword } = require("./index");   // or wherever it lives

// A parent's initial or reset password. Math.random is not
// cryptographically random; 6 random bytes in base64url is exactly 8
// characters ([A-Za-z0-9_-]) with 48 bits of entropy and no padding.
const generateParentPassword = () => crypto.randomBytes(6).toString("base64url");

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
    const plainPassword = generateParentPassword();
    data.password = await GeneratePassword(plainPassword);

    // create a new parent using the tabled info
    const newParent = await model.create(data);
    newParent.plainPassword = plainPassword;   // in memory only, not saved
    return newParent;
};

module.exports = { createParent, generateParentPassword }