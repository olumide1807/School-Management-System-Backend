// models
const { sessionModel, termModel, SuperAdminModel } = require("../models");

// middlewares
const asyncHandler = require("../middleware/async");
const {
  validateCreateSession,
  validateUpdateSession,
  validateEditTerm,
} = require("../middleware/validation");

// utils
const ErrorResponse = require("../utils/errorResponse");
const {
  timeFormat,
  checkAscendingOrder,
  changeTimeFormat,
} = require("../utils/formatTime");
const sendNotificationFallback = require("../utils/sendNotificationFallback");
const { successResponse } = require("../utils/successResponse");
const {isValidMongoId} = require("../utils/isValidMongoObjectId");

exports.createSession = asyncHandler(async (req, res, next) => {
  try {
    // Validate request body
    const { error } = validateCreateSession(req.body);
    if (error) {
      return next(new ErrorResponse(error.details[0].message, 400));
    }

    // Extract schoolId from req.user
    const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;
    const { sessionName, term } = req.body;

    // Check if session already exists
    const existingSession = await sessionModel.findOne({
      sessionName,
      schoolId,
    });
    if (existingSession) {
      return next(new ErrorResponse("Session already exists", 400));
    }

    if (req.body.currentSession === true) {
      // remove the current session
      const currentSession = await sessionModel.findOne({ schoolId, currentSession: true });

      if (currentSession) {
        currentSession.currentSession = false;
        await currentSession.save();
      }
    }

    // Create new session
    const newSession = await sessionModel.create({
      ...req.body,
      schoolId,
    });

    // Create terms for the session
    for (const singleTerm of term) {
      await termModel.create({
        ...singleTerm,
        schoolId,
        sessionId: newSession.id,
      });
    }

    // Send notification to the school's email address
    const school = await SuperAdminModel.findById(schoolId);
    const message = `You have successfully created session (${newSession.sessionName}) at ${school.schoolName}!`;
    const html = `<p>${message}</p>`;
    const title = `Session creation at ${school.schoolName}`;

    const sendMessage = await sendNotificationFallback(
      school.emailAddress,
      title,
      message,
      html
    );

    let additionalMessage = sendMessage
      ? ""
      : "but notification wasn't sent successfully to the school's email address.";

    const successMessage = `Session created successfully! ${additionalMessage}`;
    successResponse(res, 201, successMessage, newSession );
  } catch (error) {
    console.error("An error occurred while creating session:", error);
    next(error);
  }
});

exports.updateSession = asyncHandler(async (req, res, next) => {
  try{
      // validate request body
  const { error } = validateUpdateSession(req.body);
  if (error) {
    return next(new ErrorResponse(error.details[0].message, 400));
  }

  // destructure the request object
  const { user, params, body } = req;

  // extract the schoolId
  const schoolId = user.schoolName? user.id : user.schoolId;

  // extract the id
  const { id } = params;

  // validate the id
  if (!isValidMongoId(id)) {
    return next(new ErrorResponse("Invalid Id provided!", 400));
  }

  // destructure the request body
  const { sessionName, currentSession } = body;

  // check if session exists by id and schoolId
  const session = await sessionModel.findOne({
    _id: id,
    schoolId,
  });

  if (!session) {
    return next(new ErrorResponse("Session does not exist!", 400));
  }

  // check for currentSession in the request body
  if (currentSession === true) {
    // remove the current session
    const currentSession = await sessionModel.findOne({ schoolId, currentSession: true });

    if (currentSession) {
      currentSession.currentSession = false;
      await currentSession.save();
    }
  }

  // update session with request body
  Object.assign(session, body);

  // save the updated session
  await session.save();

  // send a success response
  successResponse(res, 200, "Session updated successfully!", null);

  } catch(e) {
    console.error("An error occurred while updating session:", error);
    next(error);
  }
});

exports.editTerm = asyncHandler(async (req, res, next) => {
  try {
    // Validate request body
    const { error } = validateEditTerm(req.body);
    if (error) {
      return next(new ErrorResponse(error.details[0].message, 400));
    };

    // Extract schoolId from req.user
    const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;

    // Extract termId from req.params
    const {termId} = req.params;

    // check if the id is correct.
      if(!isValidMongoId(termId)) {
        return next(new ErrorResponse("Invalid term Id provided!", 400));
      }

    // check if the term exists
    const term = await termModel.findOne({
      _id: termId,
      schoolId,
    });

    if (!term) {
      return next(new ErrorResponse("term does not exist!", 404));
    }

    if (req.body.currentTerm === true) {
      // remove the current term in the term's session
      const currentTerm = await termModel.findOne({ schoolId, currentTerm: true, sessionId: term.sessionId });

      if (currentTerm) {
        currentTerm.currentTerm = false;
        await currentTerm.save();
      }
    };

    // update the term
    Object.assign(term, req.body);

    // save the updated term
    await term.save();

    const successMessage = `Term updated successfully.`;
    successResponse(res, 200, successMessage, null);

  } catch (error) {
    console.error("An error occurred while editing term", error);
    next(error);
  }
});

exports.getCurrentSession = asyncHandler(async (req, res, next) => {
  try {
    // extract schoolId from req.user
    const {id} = req.params
    const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;

    // find current session
    const session = await sessionModel.findOne({
      schoolId,
      currentSession: true,
    });

   if(!session) {
     return next(new ErrorResponse("No current session!", 404));
   }

    // find current term in the session
    const term = await termModel.findOne({
      sessionId: session.id,
      currentTerm: true,
    });

    const data = {
      session,
      term
    };

    // send response
    successResponse(res, 200, null, data);
  } catch(error) {
    console.error("An error occurred while getting current session and term", error);
    next(error);
  }
})



exports.getTermsinSesson = asyncHandler(async(req,res,next) =>{
  try{
    const {id} = req.params
    const terms = await termModel.find({sessionId:id})
    successResponse(res,200,null,terms)
  }catch(e){
    console.error("Error getting terms in session", e);
    next(e);
  }
})
exports.getAllSessions = asyncHandler(async (req, res, next) => {
  try{
    // find all sessions
    const sessions = await sessionModel.find({schoolId: req.user.schoolName ? req.user.id : req.user.schoolId});

    // send response
    successResponse(res, 200, null, sessions);
  } catch(e) {
    console.error("An error occurred while getting all sessions", e);
    next(e);
  }
})


exports.getAllTermsInASession = asyncHandler(async (req, res, next) => {
  try{
    const { sessionId } = req.params;

    // validate the sessionId 
    if(!isValidMongoId(sessionId)) {
      return next(new ErrorResponse("Invalid session Id provided!", 400));
    }
    
    // find all terms in a session
    const terms = await termModel.find({schoolId: req.user.schoolName ? req.user.id : req.user.schoolId, sessionId});

    // send response
    successResponse(res, 200, null, terms);
  } catch(e) {
    console.error("An error occurred while getting all terms in a session", e);
    next(e);
  }
})
