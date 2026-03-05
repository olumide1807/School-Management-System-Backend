const ErrorResponse = require("../utils/errorResponse");


const isFile = (req, res, next) => {
    if (req.file) {
        const {file} = req;

        // check if file selected is an image.
        if (!file.mimetype.startsWith("image")) {
            throw new ErrorResponse("Unsupported Image Format! The accepted formats are png and jpeg.", 400);
        };

        next();
    } else {
        next();
    }
};

module.exports = isFile;