const mongoose = require("mongoose");

exports.isValidMongoId = (data) => {
    return mongoose.Types.ObjectId.isValid(data);
}