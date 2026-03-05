const jwt = require('jsonwebtoken');
const ErrorResponse = require('../utils/errorResponse');
// const {studentModel} = require('../models/student')

// Protect routes
const protect = (model) => async (req, res, next) => {
  
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

  // Make sure token exists
  if (!token || token.trim == "") {
    return next(new ErrorResponse('Unauthorized!. Please sign up or log in', 401));
  }

  try {
    // Verify token
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // console.log('it got here ',decoded.id)

    req.user = await model.findOne({_id:decoded.id});
    // console.log(req.user)
    if(!req.user) {
      return next(new ErrorResponse('Not authorized to access this route!. Please try logging in again', 401)) 
    }

    next();
  } catch (err) {
    return next(new ErrorResponse('Not authorized to access this route', 401));
  }
};

module.exports = protect

