const { GeneratePassword } = require("./index");   // or wherever it lives

const createParent = async (email, schoolId, model, data) => {
    // check if the parent exists in the school by email address
    const parent = await model.findOne({
        email,
        schoolId
    });

    if (parent) {
        return null;
    }

    // inside createParent, before the create call:
    const plainPassword = Math.random().toString(36).substring(2, 10);
    data.password = await GeneratePassword(plainPassword);

    // create a new parent using the tabled info
    const newParent = await model.create(data);
    newParent.plainPassword = plainPassword;   // in memory only, not saved
    return newParent;
    return res.status(201).json({
        success: true,
        message: "parent has been created successfully",
        data: parent,
        initialPassword: parent.plainPassword,
    });
};

module.exports = { createParent }