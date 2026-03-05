const ErrorResponse = require("../utils/errorResponse");
const { successResponse } = require("../utils/successResponse");
const { isValidMongoId } = require("../utils/isValidMongoObjectId");
const { asyncHandler } = require("../middleware");
const {
  SubjectModel,
  specificSubjectModel,
  classArmModel,
  staffModel,
  classLevelModel,
} = require("../models");

const {
  validateCreateSubject,
  validateCreateSpecificSubject,
  validateEditSubject,
  validateEditSpecificSubject,
} = require("./../middleware/validation");

// @desc      admin creates subject
// @route     POST /admin/subject
// @access    Private

exports.createSubject = asyncHandler(async (req, res, next) => {
  try {
    // validate request body
    const { error } = validateCreateSubject(req.body);

    if (error) {
      return res.status(400).json({ success: false, error: error.details });
    }

    // extract schoolId
    const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;
    const userInputSubjectName = req.body.subjectName.toLowerCase();

    // find subject
    const existingSubject = await SubjectModel.findOne({
      subjectName: {
        $regex: new RegExp("^" + userInputSubjectName + "$", "i"),
      },
      schoolId,
    });

    if (existingSubject) {
      return next(new ErrorResponse("Subject already exists!", 400));
    }

    // create new subject
    const newSubject = new SubjectModel({
      subjectName: req.body.subjectName,
      schoolId,
    });

    // save to database
    await newSubject.save();

    if (req.body.classArmIds && req.body.classArmIds.length >= 1) {
      for (const classArmId of req.body.classArmIds) {
        // validate classArmId
        if (!isValidMongoId(classArmId)) {
          return next(new ErrorResponse("Invalid classArmId(s) provided!", 400))
        }

        // find class arm
        const classArm = await classArmModel.findOne({
          _id: classArmId,
          schoolId,
        });

        if (!classArm) {
          return next(
            new ErrorResponse(
              `Class arm ${classArmId} does not exist in the school!`,
              400
            )
          );
        }

        // get classLevel
        const classLevel = await classLevelModel.findById(
          classArm.classLevelId
        );

        // find specific subject
        const specificSubject = await specificSubjectModel.findOne({
          subjectId: newSubject.id,
          classArmId,
          schoolId,
        });

        if (specificSubject) {
          return next(
            new ErrorResponse(
              `Subject has already been added to ${classLevel.levelShortName} ${classArm.armName}`,
              400
            )
          );
        }

        // add subject to class arm
        const newSpecificSubject = new specificSubjectModel({
          subjectId: newSubject.id,
          classArmId,
          schoolId,
        });

        // save to database
        await newSpecificSubject.save();
      }
    }

    successResponse(res, 201, "Subject created successfully!", null);
  } catch (error) {
    console.error("Error creating subject:", error);
    next(error);
  }
});

////////////////////////////////////////////////////////

exports.createSpecificSubject = asyncHandler(async (req, res, next) => {
  try {
    // validate the request body
    const { error } = validateCreateSpecificSubject(req.body);

    if (error) {
      return next(new ErrorResponse(error.details[0].message, 400));
    }

    // extract the schoolId
    const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;

    // extract the classArmId from the request params
    const { classArmId } = req.params;

    // validate the classArmId
    if (!isValidMongoId(classArmId)) {
      return next(new ErrorResponse("Invalid Id provided!", 400));
    }

    // find the class arm
    const classArm = await classArmModel.findOne({
      _id: classArmId,
      schoolId,
    });

    if (!classArm) {
      return next(new ErrorResponse("Class arm doesn't exist!", 400));
    }

    const userInputSubjectName = req.body.subjectName.toLowerCase();

    // find Subject
    const subject = await SubjectModel.findOne({
      subjectName: {
        $regex: new RegExp("^" + userInputSubjectName + "$", "i"),
      },
      schoolId,
    });

    if (!subject) {
      return next(
        new ErrorResponse(
          "Subject must be created before being added to a specific class.",
          400
        )
      );
    }

    // find specific subject
    const specificSubject = await specificSubjectModel.findOne({
      subjectId: subject.id,
      classArmId,
      schoolId,
    });

    if (specificSubject) {
      return next(
        new ErrorResponse("Subject has already been added to this class.", 400)
      );
    }

    // create a new specific subject
    const newSpecificSubject = new specificSubjectModel({
      subjectId: subject.id,
      classArmId,
      schoolId,
    });

    await newSpecificSubject.save();

    successResponse(res, 201, "Subject has been added to the class arm", null);
  } catch (error) {
    console.error("Error creating specific subject:", error);
    next(error);
  }
});

////////////////////////////////////////////////////////

exports.getAllSubject = asyncHandler(async (req, res, next) => {
  try {
    const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;

    const subjects = await SubjectModel.find({
      schoolId,
    });

    successResponse(res, 200, null, subjects);
  } catch (error) {
    console.error("Error fetching all subjects:", error);
    next(error);
  }
});

////////////////////////////////////////////////////////

exports.getAllSubjectInAClass = asyncHandler(async (req, res, next) => {
  try {
    // extract schoolId
    const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;

    // extract classArmId from request param
    const { classArmId } = req.params;

    // validate classArmId
    if (!isValidMongoId(classArmId)) {
      return next(new ErrorResponse("classArmId provided is invalid!", 400));
    }

    const classArm = await classArmModel.findOne({
      _id: classArmId,
      schoolId,
    });

    if (!classArm) {
      return next(new ErrorResponse("class arm does not exist!", 404));
    }

    // find subjects by schoolId and classArmId
    const subjects = await specificSubjectModel.find({
      schoolId,
      classArmId,
    });

    // return response and data
    successResponse(res, 200, null, subjects);
  } catch (error) {
    console.error("Error getting all subjects in a class", error);
    next(error);
  }
});

////////////////////////////////////////////////////////

exports.getSubjectById = asyncHandler(async (req, res, next) => {
  try {
    const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;

    // validate id
    if (!isValidMongoId(req.params.id)) {
      return next(new ErrorResponse("Invalid Id provided!", 400));
    }

    // extract id from request params
    const { id } = req.params;

    let subject;

    if (req.query.find === "subject") {
      subject = await SubjectModel.findOne({
        _id: id,
        schoolId,
      });
    } else if (req.query.find === "specificSubject") {
      subject = await specificSubjectModel.findOne({
        _id: id,
        schoolId,
      });
    }

    if (!subject) {
      return next(
        new ErrorResponse(
          `${
            req.query.find === "subject" ? "subject" : "specific subject"
          } not found!`,
          404
        )
      );
    }

    successResponse(res, 200, null, subject);
  } catch (error) {
    console.error("Error fetching subject by ID:", error);
    return next(error);
  }
});

////////////////////////////////////////////////////////

exports.getAllSpecificSubjectsUnderASubject = asyncHandler(
  async (req, res, next) => {
    try {
      const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;

      // extract subjectId from request params.
      const { subjectId } = req.params;

      // validate subjectId
      if (!isValidMongoId(subjectId)) {
        return next(new ErrorResponse("Invalid Id provided!", 400));
      }

      // Check if the subject exists
      const subject = await SubjectModel.findById(subjectId);

      if (!subject) {
        return next(new ErrorResponse("Subject does not exist! 😢", 404));
      }

      // Retrieve specific subjects under the specified subject
      const specificSubjects = await specificSubjectModel.find({
        subjectId,
        schoolId,
      });

      successResponse(res, 200, null, specificSubjects);
    } catch (error) {
      console.error("Error fetching specific subjects under a subject:", error);
      return next(error);
    }
  }
);

////////////////////////////////////////////////////////

exports.editSubject = asyncHandler(async (req, res, next) => {
  try {
    // Validate request body
    const { error } = validateEditSubject(req.body);

    if (error) {
      return next(new ErrorResponse(error.details[0].message, 400));
    }

    let schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;

    // extract id from request params
    const { id } = req.params;

    // validate id
    if (!isValidMongoId(id)) {
      return next(new ErrorResponse("Invalid Id provided!"));
    }

    // find the subject
    let subject = await SubjectModel.findById(id);

    if (!subject) {
      return next(new ErrorResponse("Subject does not exist! 😢", 404));
    }

    // check if the subject name already exists
    const userInputSubjectName = req.body.subjectName.toLowerCase();
    const existingSubject = await SubjectModel.findOne({
      schoolId: schoolId,
      subjectName: {
        $regex: new RegExp("^" + userInputSubjectName + "$", "i"),
      },
    });

    if (existingSubject) {
      return next(new ErrorResponse("The subject name already exists!", 400));
    }

    // update the subject
    subject.subjectName = req.body.subjectName;

    await subject.save();

    successResponse(res, 200, "Subject updated successfully!", null);
  } catch (error) {
    console.error("Error editing subject:", error);
    return next(error);
  }
});

////////////////////////////////////////////////////////

exports.deleteSubject = asyncHandler(async (req, res, next) => {
  try {
    const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;

    if (
      !req.query.find ||
      !["subject", "specificSubject"].includes(req.query.find)
    ) {
      return res.status(400).json({
        success: false,
        error:
          "Invalid query parameter. It should be 'subject' or 'specificSubject'.",
      });
    }

    const id = req.params.id;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new ErrorResponse("Invalid ID format", 400));
    }

    const deleteSubjectById = async (Model) => {
      const subject = await Model.findById(id);

      if (!subject) {
        return next(
          new ErrorResponse(`${req.query.find} does not exist!`, 404)
        );
      }

      await Model.findByIdAndDelete(id);
    };

    if (req.query.find === "subject") {
      await deleteSubjectById(SubjectModel);
      await specificSubjectModel.deleteMany({ subjectId: id });

      return res.status(200).json({
        success: true,
        data: `The subject has been removed entirely from the school 🙂`,
      });
    }

    if (req.query.find === "specificSubject") {
      await deleteSubjectById(specificSubjectModel);

      const subject = await specificSubjectModel.findById(id);
      const classArm = await classArmModel.findById(subject.classArmId);

      const count = await specificSubjectModel.countDocuments({
        classArmId: classArm.id,
        schoolId,
      });

      classArm.numberOfSubjects = count;
      await classArm.save();

      return res.status(200).json({
        success: true,
        data: `The specific subject has been removed 🙂`,
      });
    }
  } catch (error) {
    // Log or handle errors appropriately
    next(error);
  }
});

exports.editSpecificSubject = asyncHandler(async (req, res, next) => {
  try {
    // validate request body
    const { error } = validateEditSpecificSubject(req.body);

    if (error) {
      return next(new ErrorResponse(error.details[0].message, 400));
    }

    // extract schoolId
    const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;

    // extract id from request params
    const { id } = req.params;

    // destructure the request body
    const { subjectTeacherId } = req.body;

    // validate ids
    for (id of [id, subjectTeacherId]) {
      if (!isValidMongoId(id)) {
        return next(
          new ErrorResponse("Invalid Id(specific subject or teacher) provided!")
        );
      }
    }

    // find the teacher(make sure he is academic)
    const teacher = await staffModel.findOne({
      _id: subjectTeacherId,
      schoolId,
      staffType: "academic",
    });

    if (!teacher) {
      return next(
        new ErrorResponse("Teacher is not academic or does not exist!", 404)
      );
    }

    // find the specific subject
    const specificSubject = await specificSubjectModel.findOne({
      _id: id,
      schoolId,
    });

    if (!specificSubject) {
      return next(new ErrorResponse("Specific subject does not exist!", 404));
    }

    // update the specific subject
    specificSubject.subjectTeacherId = subjectTeacherId;

    await specificSubject.save();

    successResponse(res, 200, "Specific subject updated successfully!", null);
  } catch (e) {
    console.error("Error editing specific subject!", e);
    next(e);
  }
});
