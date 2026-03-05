const ErrorResponse = require("../utils/errorResponse");

const isDocPdfCsv = (req, res, next) => {
  const { file } = req;

  if (file) {
    const mimeTypes = [
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/pdf",
      "text/csv",
      "application/csv",
      "text/plain",
    ];

    if (mimeTypes.includes(file.mimetype)) {
        next();
    } else {
        throw new ErrorResponse("Unsupported file format!", 400);
    }
  } else {
    throw new ErrorResponse("No file selected!", 400);
  }
};

module.exports = isDocPdfCsv;