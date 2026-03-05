// middleware
const { asyncHandler } = require("../middleware");
const { validateRegister, validateLinkParent, validateEditStudent, validateCreateStudentAttendance, validateUpdateStaffAttendance } = require("../middleware/validation");

// utils
const ErrorResponse = require("../utils/errorResponse");
const { generateRandomId } = require("../utils/generateRandomId");
const { createParent } = require("../utils/createParent");
const { linkParent } = require("../utils/linkParent");
const { successResponse } = require("../utils/successResponse");
const { isValidMongoId } = require("../utils/isValidMongoObjectId");
const cloudinary = require("../utils/cloudinary");

// models
const {
  SuperAdminModel,
  studentModel, 
  parentModel,
  classArmModel,
  sessionModel,
  studentAttendanceModel
} = require("../models");
const session = require("../models/session");
const Attendance = require('../models/student_attendance');

///////////////////////////////////////////////////////////////////////////////

exports.registerStudent = asyncHandler(async (req, res, next) => {

  
  try {

    const {file,body, user} = req;


    const {
      classArmId,
      gender,
      surName,
      email,
      dateOfBirth,
      studentID,
      firstName,
      otherName,
      phoneNumber,
      country,
      stateOfOrigin,
      localGovernmentArea,
      address,
      parentID,
      relationship,
      parentTitle,
      parentFirstName,
      parentSurName,
      parentGender,
      maritalStatus,
      parentEmail,
      parentPhoneNumber,
      parentCountry,
      occupation,
      parentAddress,
    } = body;

    const { error } = validateRegister(body);

    if (error) {
      return next(new ErrorResponse(error.details[0].message, 400));
    }

    const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;

    

    // check if classArm exists in the school
    const classArm = await classArmModel.findOne({
      _id: classArmId,
      schoolId,
    });

    if (!classArm) {
      return next(
        new ErrorResponse(
          `classArm with id: ${classArmId} doesn't exist in your school`,
          404
        )
      );
    }

    const studentId = studentID
      ? studentID
      : await generateRandomId(schoolId, SuperAdminModel, studentModel);

    const student = await studentModel.findOne({
      schoolId,
      studentID: studentId,
    });

    if (student) {
      return next(
        new ErrorResponse(
          `student with id: ${studentId} already exist in your school`, 400
        )
      );
    }

    // check if file is uploaded
    if (!file) {
      return next(new ErrorResponse("Please upload a photo", 400));
    }

    // save image to cloudinary and get the url
    const result = await cloudinary.uploader.upload(file.path);

    let object = {
      studentID: studentId,
      firstName,
      surName,
      otherName: otherName || null,
      email: email || null,
      classArmId,
      gender,
      dateOfBirth,
      phoneNumber: phoneNumber || null,
      country,
      stateOfOrigin,
      localGovernmentArea,
      address,
      password: studentId,
      schoolId,
      guardians: [],
      photo:result.secure_url
    };

    let parentId;

    if (!parentID || parentID.trim() === "") {
      const requiredFields = [
        { field: "parent title", value: parentTitle },
        { field: "parent first name", value: parentFirstName },
        { field: "parent surname", value: parentSurName },
        { field: "parent gender", value: parentGender },
        { field: "parent marital status", value: maritalStatus },
        { field: "parent email", value: parentEmail },
        { field: "parent phone number", value: parentPhoneNumber },
        { field: "parent country", value: parentCountry },
        { field: "parent occupation", value: occupation },
        { field: "parent address", value: parentAddress },
      ];

      for (const fieldInfo of requiredFields) {
        const { field, value } = fieldInfo;
        if (!value) {
          return next(
            new ErrorResponse(`${field} is needed to create a new parent`, 400)
          );
        }
      }

      const data = {
        title: parentTitle,
        surName: parentSurName,
        firstName: parentFirstName,
        maritalStatus,
        email: parentEmail,
        phoneNumber: parentPhoneNumber,
        occupation,
        address: parentAddress,
        gender: parentGender,
        country: parentCountry,
        schoolId,
        type: "linked"
      };

      const parent = await createParent(
        parentEmail,
        schoolId,
        parentModel,
        data,
      );

      if (!parent) {
        return next(
          new ErrorResponse(
            `parent with email address: ${parentEmail} already exists in the school. therefore you can't create a new one.`
          )
        );
      }

      parentId = parent.id;

      object.guardians.push({
        parentId,
        relationship
      })
    } else {
      parentId = parentID;

      object = await linkParent(
        parentId,
        schoolId,
        relationship,
        object
      );
  
      if (!object) {
        return next(
          new ErrorResponse(
            "Parent doesn't exist. Therefore you can't link it to the student"
          )
        );
      }
    }

    const newStudent = new studentModel(object);

    await newStudent.save();

    res.status(201).json({
      success: true,
      message: `student created and linked successfully`,
      data: {
        student: newStudent,
        parentId,
      },
    });
  } catch (error) {
    console.error(`error from registering student: ${error}`);
    return next(
      new ErrorResponse(
        "error registering student, please try again later",
        500
      )
    );
  }
});

///////////////////////////////////////////////////////////////////////////////////////////////////

exports.linkNewParent = asyncHandler(async (req, res, next) => {
  try {
    const { error } = validateLinkParent(req.body);

    if (error) {
      return next(new ErrorResponse(error.details[0].message, 400));
    }

    const schoolId = req.user.schoolName ? req.user : req.user.schoolId;
    const studentId = req.params.id;

    // Check if student exists in the school
    const student = await studentModel.findOne({ _id: studentId, schoolId });

    if (!student) {
      return next(new ErrorResponse(`Student with id: ${studentId} not found in your school`, 400));
    }

    const { parentId, relationship } = req.body;

    // Check if the parent already exists among the guardians
    const isParentLinked = student.guardians.some(guardian => guardian.parentId.equals(parentId));

    if (isParentLinked) {
      return next(new ErrorResponse(`Parent with id: ${parentId} is already linked to the student`, 400));
    }

    // Link parent
    const linkedParent = await linkParent(parentId, schoolId, relationship, {});

    if (!linkedParent) {
      return next(new ErrorResponse(`Parent with id: ${parentId} does not exist, therefore it can't be linked.`, 400));
    }

    // Update student's guardians
    student.guardians.push(...linkedParent.guardians);
    await student.save();

    return res.status(200).json({
      success: true,
      message: "Parent linked to student successfully!",
    });
  } catch (error) {
    console.error(`Error linking new parent: ${error}`);
    return next(new ErrorResponse("Error linking new parent, please try again later", 500));
  }
});

////////////////////////////////////////////////////////////////////////////////

exports.deleteStudent = asyncHandler(async(req, res, next) => {
  try{
    // extract schoolId
    const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;

    // extract studentId from query param
    const { id } = req.params;

    // does student exist in the school?
    const student = await studentModel.findOne({ _id: id, schoolId });

    // no?
    if (!student) return next(new ErrorResponse(`student with ${id} doesn't exist in your school`))

    // otherwise, delete
    await studentModel.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: "student deleted successfully."
    })

  } catch (e) {
    console.error(`Error deleting student: ${e}`);
    return next(new ErrorResponse("Error deleting student, please try again later", 500));
  }
});

///////////////////////////////////////////////////////////////////////////////////////

exports.deactivateStudent = asyncHandler(async(req, res, next) => {
  try{
    // extract the schoolId
    const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;

    // extract the studentId
    const { id } = req.params;

    // does the student exist in the school?
    const student = await studentModel.findOne({ _id: id, schoolId  });

    // no? return error
    if (!student)  return next(new ErrorResponse(`student with ${id} doesn't exist in your school`));

    // otherwise, update status
    student.status = "deactivated";

    // save to the database
    await student.save();

    return res.status(200).json({
      success: true,
      message: "student deactivated successfully"
    });
  } catch(e) {
    console.error(`Error deactivating student: ${e}`);
    return next(new ErrorResponse("Error deactivating student, please try again later", 500));
  }
})

//////////////////////////////////////////////////////////////////////////////////////////

exports.activateStudent = asyncHandler(async(req, res, next) => {
  try{
    // extract the schoolId
    const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;

    // extract the studentId
    const { id } = req.params;

    // does the student exist in the school?
    const student = await studentModel.findOne({ _id: id, schoolId  });

    // no? return error
    if (!student)  return next(new ErrorResponse(`student with ${id} doesn't exist in your school`));

    // otherwise, update status
    student.status = "active";

    // save to the database
    await student.save();

    return res.status(200).json({
      success: true,
      message: "student activated successfully"
    });
  } catch (e) {
    console.error(`Error activating student: ${e}`);
    return next(new ErrorResponse("Error activating student, please try again later", 500));
  }
})

/////////////////////////////////////////////////////////////////////////////////////

exports.editStudent = asyncHandler(async(req, res, next) => {
  try{
    // validate request body
    const { error } = validateEditStudent(req.body);

    if (error) return next(new ErrorResponse(error.details[0].message, 400));

    // extract the schoolId
    const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;

    // extract the studentId
    const { id } = req.params;

    // does the student exist in the school?
    const student = await studentModel.findOne({ _id: id, schoolId  });

    // no? return error
    if (!student)  return next(new ErrorResponse(`student with ${id} doesn't exist in your school`));

    // otherwise, update student
    await studentModel.findByIdAndUpdate(id, req.body);

    return res.status(200).json({
      success: true,
      message: "student updated successfully"
    })
  } catch (e) {
    console.error(`Error updating student: ${e}`);
    return next(new ErrorResponse("Error updating student, please try again later", 500));
  }
})

///////////////////////////////////////////////////////////////////////////////////

exports.getAllStudents = asyncHandler(async (req, res, next) => {
  try{
    // extract the schoolId
    const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;

    let data;

    const { query } = req;
    const { find } = query;

    if (!find) {
      data = await studentModel.find({ schoolId });
    } else {
      switch (find) {
        case "unlinked":
          data = await studentModel.find({
            schoolId,
            $expr: { $lt: [{ $size: "$guardians" }, 1] }
          });
          break;
      
        case "linked":
          data = await studentModel.find({
            schoolId,
            $expr: { $gte: [{ $size: "$guardians" }, 1] }
          });
          break;
      
        case "active":
          data = await studentModel.find({
            schoolId,
            status: "active"
          });
          break;
      
        case "deactivated":
          data = await studentModel.find({
            schoolId,
            status: "deactivated"
          });
          break;

        default:
          return next(new ErrorResponse("please your request isn't understood. only four (4) options we have - unlinked, linked, active and deactivated"));  
      }
      
    }

    // send response
    successResponse(res, 200, null, data);
  } catch (e) {
    console.error(`Error getting students: ${e}`);
    next(e);
  }
});

//////////////////////////////////////////////////////////////////////////

exports.createAttendance = asyncHandler(async (req, res, next) => {
  try {
    // validate request body
    const { error } = validateCreateStudentAttendance(req.body);

    if (error) {
      return next(new ErrorResponse(error.details[0].message, 400));
    };

    const { user } = req;
    const schoolId = user.schoolName ? user.id : user.schoolId;

    const { studentId, classArmId, sessionId, term, date, status } = req.body;

    const IDs = [ studentId, classArmId, sessionId ];

    for (const id of IDs) {
      if (!isValidMongoId(id)) {
        throw new ErrorResponse(`Invalid id provided`, 400);
      }
    };

    // check if class arm exists in the school
    const classArm = await classArmModel.findOne({
      _id: classArmId,
      schoolId
    });

    if(!classArm) {
      return next(new ErrorResponse("class arm not found in your school"));
    }

    // check if the user is the class teacher or the school
    if(classArm.assignedTeacher != user.id && !user.schoolName) {
      return next(new ErrorResponse("You don't have access to this operation!", 403));
    };

    // check if the student exists in the school
    const student = await studentModel.findOne({
    _id: studentId,
    schoolId
    });

    if (!student) {
      return next(new ErrorResponse("Student not found in your school!", 404));
    };

    // check if the session exists in the school
    const session = await sessionModel.findOne({
      _id: sessionId,
      schoolId
    });

    if (!session) {
      return next(new ErrorResponse("Session not found in your school!", 404));
    };

    req.body.schoolId = schoolId;

    // check if the attendance exists
    const attendance = await studentAttendanceModel.findOne(req.body);

    if (attendance) {
      return next(new ErrorResponse("Student attendance already exists!", 400));
    }

    await studentAttendanceModel.create(req.body);

    successResponse(res, 201, "student attendance successfully created");
  } catch (error) {
    console.error("An error occured while creating student attendance!", error);
    next(error);
  }
});

////////////////////////////////////////////////////////////////////////////

exports.updateAttendance = asyncHandler(async (req, res, next) => {
  try {
    // validate request body
    const { error } = validateUpdateStaffAttendance(req.body);

    if (error) {
      return next(new ErrorResponse(error.details[0].message, 400));
    };

    const { id } = req.params;
    const { user } = req;
    const schoolId = user.schoolName ? user.id : user.schollId;
    const { status } = req.body;

    // check if the id is valid
    if (!isValidMongoId(id)) {
      return next(new ErrorResponse("Invalid ID provided"));
    };

    // check if the attendance with the ID exists in the school
    const attendance = await studentAttendanceModel.findOne({
      _id: id,
      schoolId
    });

    if (!attendance) {
      return next(new ErrorResponse("student attendance does not exist in your school!", 404));
    }

    const classArm = await classArmModel.findById(attendance.classArmId);

    // check if the user is the school or the class teacher
    if (!user.schoolName && classArm.assignedTeacher != user.id) {
      return next(new ErrorResponse("You don't have access to this operation!", 403));
    }

    // update the attendance
    attendance.status = status;

    // save to the database
    await attendance.save()

    successResponse(res, 200, "student attendance updated successfully");

  } catch (error) {
    console.error("An error occured while updating student attendance!", error);
    next(error);
  }
})

//////////////////////////////////////////////////////////

exports.deleteAttendance = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    const { user } = req;
    const schoolId = user.schoolName ? user.id : user.schoolId;

    // check if the id is valid
    if (!isValidMongoId(id)) {
      return next(new ErrorResponse("Invalid ID provided"));
    };

    // check if the attendance with the ID exists in the school
    const attendance = await studentAttendanceModel.findOne({
      _id: id,
      schoolId
    });

    if (!attendance) {
      return next(new ErrorResponse("student attendance does not exist in your school!", 404));
    }

    const classArm = await classArmModel.findById(attendance.classArmId);

    // check if the user is the school or the class teacher
    if (!user.schoolName && classArm.assignedTeacher != user.id) {
      return next(new ErrorResponse("You don't have access to this operation!", 403));
    };

    // delete the attendance
    await studentAttendanceModel.findByIdAndDelete(id);

    successResponse(res, 200, "student attendance deleted successfully");

  } catch (error) {
    console.error("An error occured while deleting student attendance!", error);
    next(error);
  }
})

//////////////////////////////////////////////////////////////

exports.getAllStudentAttendance = asyncHandler(async (req, res, next) => {
  try {
    const { user } = req;
    const schoolId = user.schoolName ? user.id : user.schoolId;
    const { query } = req;
    const { classArmId, term, sessionId, date, status } = query;

    // validate the IDs
    const IDs = [classArmId, sessionId];
    for (id of IDs) {
      if (id) {
        if(!isValidMongoId(id)) {
          throw new ErrorResponse("Invalid ID(s) provided!", 400);
        }
      }
    };

    // update the query
    query.schoolId = schoolId;

    // find
    let attendances = await studentAttendanceModel.find(query);

    let message = null;

    if (attendances.length < 1) {
      message = "Student attendance list empty!";
      attendances = null;
    }
    
    successResponse(res, 200, message, attendances);
  } catch (error) {
    console.error("An error occured while fetching students attendance!", error);
    next(error);
  }
});

//////////////////////////////////////////////////////////////////

exports.getStudentAttendance = asyncHandler(async (req, res, next) => {
  try {
    const { user } = req;
    const schoolId = user.schoolName ? user.id : user.schoolId;
    const { query } = req;
    const { classArmId, term, sessionId, date, status } = query;
    const { id } = req.params;

    // validate the IDs
    const IDs = [classArmId, sessionId, id];
    for (Id of IDs) {
      if (Id) {
        if(!isValidMongoId(Id)) {
          throw new ErrorResponse("Invalid ID(s) provided!", 400);
        }
      }
    };

    // update the query
    query.schoolId = schoolId;
    query.studentId = id;

    // find
    const attendance = await studentAttendanceModel.findOne(query);

    if (!attendance) {
      return next(new ErrorResponse("Student attendance not found!", 404));
    }
    
    successResponse(res, 200, null, attendance);
  } catch (error) {
    console.error("An error occured while fetching students attendance!", error);
    next(error);
  }
});

//////////////////////////////////////////////////

exports.getAllStudentsInAClass = asyncHandler(async (req, res, next) => {
  try{
    // extract the schoolId
    const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;

    // extract classArmId from the request params
    const { classArmId } = req.params;

    // validate classArmId
    if(!isValidMongoId(classArmId)) {
      return next(new ErrorResponse("Invalid classArmId provided!", 400));
    }

    // check if class arm exists
    const classArm = await classArmModel.findOne({
      _id: classArmId,
      schoolId
    });

    if (!classArm) {
      return next(new ErrorResponse("class arm does not exist!", 404));
    }

    // find all students in the classArm
    const students = await studentModel.find({
      classArmId,
      schoolId
    });

    // return response and data
    successResponse(res, 200, null, students);
  }catch(e){
    console.error("error getting all students in a class!", e);
    next(e);
  }
})