const { parentModel } = require("../models")

const linkParent = async (parentId, schoolId, relationship, object) => {
    const parent = await parentModel.findOne({
        _id: parentId,
        schoolId
    });

    if (!parent) {
        return null;
    }

    const guardian = {
        parentId,
        relationship
    }

    object.guardians.push(guardian);

    parent.type = "linked";

    await parent.save()

    return object;
};

module.exports = { linkParent };