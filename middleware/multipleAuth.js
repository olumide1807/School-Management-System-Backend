const jwt = require("jsonwebtoken");
const ErrorResponse = require("../utils/errorResponse");
const { SuperAdminModel, staffModel, studentModel, parentModel } = require("../models");

const protect = (allowedRoles) => async (req, res, next) => {
  let token = req.signedCookies["token"];

  console.log("token", token);

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    // Set token from Bearer token in header
    token = req.headers.authorization.split(' ')[1];
    console.log("bearer token", token);
  }

  if (!token || token.trim() === "") {
    return next(new ErrorResponse('Unauthorized! Please sign up or log in', 401));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    let user = null;

    // Search for the user in each model based on allowed roles
    if (allowedRoles.includes("staff")) {
      user = await staffModel.findOne({ _id: decoded.id });
      if (user) user.userType = "staff";
    }

    if (!user && allowedRoles.includes("super admin")) {
      user = await SuperAdminModel.findOne({ _id: decoded.id });
      if (user) user.userType = "admin";
    }

    if (!user && allowedRoles.includes("student")) {
      user = await studentModel.findOne({ _id: decoded.id });
      if (user) user.userType = "student";
    }

    if (!user && allowedRoles.includes("parent")) {
      user = await parentModel.findOne({ _id: decoded.id });
      if (user) user.userType = "parent";
    }

    // If no user found or not authorized, return an error response
    if (!user) {
      return next(new ErrorResponse('Not authorized to access this route! Please try logging in again', 401));
    }

    // Attach the user to the request object
    req.user = user;
    next();
  } catch (err) {
    console.log(err);
    return next(new ErrorResponse(`Error verifying authorization: ${err}`, 401));
  }
};

module.exports = protect;
