// middleware
const { asyncHandler } = require("../middleware");
const {
  validatecreateAnnouncement,
  validateUpdateAnnouncement,
} = require("../middleware/validation");

// utils
const ErrorResponse = require("../utils/errorResponse");
const { checkAscendingOrder, timeFormat, changeTimeFormat } = require("../utils/formatTime");
const { successResponse } = require("../utils/successResponse");

// models
const { announcementModel } = require("./../models/index");

//////////////////////////////////////////////////////////////////////////////////////////

exports.createAnnouncement = asyncHandler(async (req, res, next) => {
  const { error } = validatecreateAnnouncement(req.body);

  if (error) {
    return next(new ErrorResponse(error.details[0].message, 400));
  }

  const schoolId = req.user?.schoolName ? req.user.id : req.user?.schoolId;

  try {
    // Check if the announcement exists by title
    const announcementExists = await announcementModel.findOne({
      title: req.body.title,
      schoolId,
    });

    if (announcementExists) {
      return next(
        new ErrorResponse(
          "Announcement title already exists. Please choose a different title.",
          409
        )
      );
    }

    // Set the Author property
    req.body.author = req.user.id;

    // Set the schoolId
    req.body.schoolId = schoolId;

    // Validate startDate and endDate
    if (req.body.startDate && req.body.endDate) {

      const startDate = changeTimeFormat(req.body.startDate);
      const endDate = changeTimeFormat(req.body.endDate);
      
      console.log("request body start date", req.body.startDate);
      console.log("converted start date", startDate);

      console.log("request body end date", req.body.endDate);
      console.log("converted end date", endDate);
    }

    const announcement = await announcementModel.create(req.body);

    successResponse(res, 201, "Announcement created successfully.");
  } catch (error) {
    console.error("Error creating announcement:", error);
    return next(error);
  }
});


///////////////////////////////////////////////////////////////

exports.getAllAnnouncement = asyncHandler(async (req, res, next) => {
  const { user } = req;
  const schoolId = user?.schoolName ? user.id : user?.schoolId;
  let userType = user?.userType;

  // Map parent userType to student
  if (userType === "parent") {
    userType = "student";
  }

  const today = new Date();

  // Define query conditions based on request type
  const queryConditions = { schoolId };

  if (userType !== "admin") {
    queryConditions.visibleTo = userType;
  }

  if (req.query?.important) {
    queryConditions.important = req.query.important === 'true';
  }

  if (req.query?.type === "available") {
    queryConditions.endDate = { $gte: today };
  } else if (req.query?.type === "due") {
    queryConditions.endDate = { $lt: today };
  }

  try {
    const announcements = await announcementModel.find(queryConditions);
    successResponse(res, 200, null, announcements);
  } catch (error) {
    console.error("Error occurred while finding announcements: ", error);
    next(new ErrorResponse("Failed to retrieve announcements", 500));
  }
});

////////////////////////////////////////////////////////////////

exports.getAnnouncementById = asyncHandler(async (req, res, next) => {
  const { user } = req;
  const schoolId = user?.schoolName ? user.id : user?.schoolId;
  let userType = user?.userType;

  // Ensure the user is logged in
  if (!schoolId) {
    return next(new ErrorResponse("Please log in!", 401));
  }

  // Map parent userType to student
  if (userType === "parent") {
    userType = "student";
  }

  // Set query parameters
  const query = {
    _id: req.params.id,
    schoolId
  };

  if (userType !== "admin") {
    query.visibleTo = userType;
  }

  try {
    const announcement = await announcementModel.findOne(query);

    if (!announcement) {
      return next(new ErrorResponse("Announcement not found!", 404));
    }

    successResponse(res, 200, null, announcement);
  } catch (error) {
    console.error("Error getting announcement by id", error);
    next(error);
  }
});

///////////////////////////////////////////////////////

exports.updateAnnouncement = asyncHandler(async (req, res, next) => {
  const { error } = validateUpdateAnnouncement(req.body);
  if (error) {
    return res.status(400).json({ success: false, error: error.details[0].message });
  }

  const { id } = req.params;
  const { user, body } = req;

  const schoolId = user?.schoolName ? user.id : user?.schoolId;

  if (!schoolId) {
    return next(new ErrorResponse("Please log in!", 401));
  }

  try {
    const announcement = await announcementModel.findOne({ _id: id, schoolId });

    if (!announcement) {
      return next(new ErrorResponse("Announcement not found!", 404));
    }

    if (user.id !== announcement.author && !user.schoolName) {
      return next(new ErrorResponse("You don't have permission to update this announcement!", 403));
    }

    const fieldsToUpdate = ['title', 'description', 'startDate', 'endDate', 'visibleTo', 'important'];

    for (const field of fieldsToUpdate) {
      if (body[field] !== undefined) {
        if (field === 'startDate' || field === 'endDate') {
          const date = changeTimeFormat(body[field]);
          if (field === 'startDate' && date < Date.now()) {
            return next(new ErrorResponse("Start date must be greater than or equal to the current date.", 400));
          }
          if (field === 'endDate') {
            let startDate = changeTimeFormat(announcement.startDate);
            if (date < startDate) {
              return next(new ErrorResponse("End date must be greater than or equal to start date.", 400));
            }
          }
          announcement[field] = date;
        } else {
          announcement[field] = body[field];
        }
      }
    }

    await announcement.save();

    successResponse(res, 200, "Announcement updated successfully.");
  } catch (error) {
    console.error("Error updating announcement:", error);
    next(error);
  }
});



/////////////////////////////////////////////////////////////

exports.deleteAnnouncement = asyncHandler(async (req, res, next) => {
  const schoolId = req.user?.schoolName ? req.user.id : req.user?.schoolId;

  try {
    const announcement = await announcementModel.findOne({
      _id: req.params.id,
      schoolId,
    });

    if (!announcement) {
      return next(
        new ErrorResponse("Announcement not found in your school", 404)
      );
    }

    if (req.user.id !== announcement.author && !req.user.schoolName) {
      return next(
        new ErrorResponse(
          "You don't have permission to delete this announcement",
          403
        )
      );
    }

    await announcementModel.findByIdAndDelete(req.params.id);

    successResponse(res, 200, "announcement deleted successfully!");
  } catch (error) {
    console.error("Error deleting announcement:", error);
    return next(error);
  }
});
