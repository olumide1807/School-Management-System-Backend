const createParent = async (email, schoolId, model, data) => {
    // check if the parent exists in the school by email address
    const parent = await model.findOne({
        email,
        schoolId
    });

    

    if (parent) {
        return null;
    }

    // create a new parent using the tabled info
    const newParent = await model.create(data);

    return newParent;
};

module.exports = { createParent }