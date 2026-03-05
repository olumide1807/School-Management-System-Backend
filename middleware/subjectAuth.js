const jwt = require("jsonwebtoken");
const ErrorResponse = require("../utils/errorResponse");
const {
  SuperAdminModel,
  staffModel
} = require("../models");

const subjectProtect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return next(new ErrorResponse("Not authorized to access this route", 401));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    let user = null;

    // Check if the user is a SuperAdmin and has the "super admin" role
    if (!user) {
      user = await SuperAdminModel.findOne({ _id: decoded.id });
      user.schoolId = user._id;
    }

    // Check if the user is a Staff and has the "staff" role
    if (!user) {
      user = await staffModel.findOne({ _id: decoded.id });
    }

    if (!user) {
      return next(
        new ErrorResponse(
          "Not authorized to access this route! Please try logging in again",
          401
        )
      );
    }

    req.user = user;

    next();
  } catch (err) {
    return next(
      new ErrorResponse(
        "Not authorized to access this route! Please try logging in again",
        401
      )
    );
  }
};


module.exports = subjectProtect;