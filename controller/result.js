const { asyncHandler } = require("../middleware");
const ErrorResponse = require("../utils/errorResponse");
const { successResponse } = require("../utils/successResponse");
const {resultModel, sessionModel, studentModel, classLevelModel, classArmModel, termModel} = require("../models");
const classLevel = require("../models/classLevel");

// upload student report per term 
exports.createResult = asyncHandler(async(req, res, next) => {
    console.log('it got here')

    const {studentId , schoolId, sessionId , classLevelId, classArmId, Terms} = req.body
    console.log(req.body)
    console.log(Terms[0])

    // check if the student exist with studentid , sessionId and classLevelId
    const query = {
        student: studentId,
        session: sessionId,
        classLevel: classLevelId,
        school:schoolId
    };
    const studentResultExist = await resultModel.findOne(query)

    console.log(studentResultExist, '....')

    if(studentResultExist){


        console.log('school required')
        let newTermId = Terms[0].termId
         // Check if the new result is not for an existing term already in the Terms array
         const termExists = studentResultExist.Terms.some(term => term.termId === newTermId);

         if(termExists){
                return next(new ErrorResponse(`Term with id ${newTermId} already exist`, 400))
         }

        // Add the new term to the Terms array
        studentResultExist.Terms.push(Terms[0])
        studentResultExist.save()
        return successResponse(res,200,"Result Uploaded successfully", studentResultExist)

    }
console.log('it got here')
    const student = await studentModel.findById(studentId)

    if(!student){
        return next(new ErrorResponse("Student not found", 404))
    }
    // check if the session exist in
    const session = await sessionModel.findById(sessionId)

    if(!session){
        return next(new ErrorResponse("Session not found", 404))
    }
    // check if the class level exist
    const class_level = await  classLevelModel.findById(classLevelId)
    if(!class_level){
        return next(new ErrorResponse("Class level not found", 404))
    }

    // check if the class arm exist
    const class_arm = await classArmModel.findById(classArmId)
    if(!class_arm){
        return next(new ErrorResponse("Class arm not found", 404))
    }

    // check if the term exist
   const term = await termModel.findById(Terms[0].termId)

    if(!term){
       return next( new ErrorResponse(`The term with id ${Terms[0].termId} not found`, 404))
    }


    const result = await resultModel.create({
        student: studentId,
        session: sessionId,
        classLevel: classLevelId,
        classArm: classArmId,
        school:schoolId,
        Terms: Terms
    })


    console.log(result.Terms[0].subjects)

   return successResponse(res,200,"Result Uploaded successfully", result)


})

// edit a term result
exports.editResult = asyncHandler(async (req,res,next) => {

    const {studentId ,schoolId ,sessionId, classLevelId, classArmId, Terms} = req.body


    const query = {
        student: studentId,
        session: sessionId,
        classLevel: classLevelId,
        school: schoolId,
        classArm:classArmId
    };

    // check it the student record exist
    const studentResultExist = await resultModel.findOne(query)

    console.log(studentResultExist, '....')

    if(studentResultExist){

        let newTermId = Terms[0].termId
         // Check if the student term result exist in the Terms array
         const termExists = studentResultExist.Terms.some(term => term.termId === Terms[0].termId);

         if(termExists){
               const index = studentResultExist.Terms.findIndex(term => term.termId === Terms[0].termId)

               if (index !== -1) {
                studentResultExist.Terms.splice(index, 1);
              }

              studentResultExist.Terms.push(Terms[0])
                studentResultExist.save()

               return successResponse(res,200,"Result Uploaded successfully", studentResultExist)
         }
         else if(!termExists){

            // Add the new term to the Terms array
            studentResultExist.Terms.push(Terms[0])
            studentResultExist.save()
            return  successResponse(res,200,"Result Uploaded successfully", studentResultExist)

         }
         else{
            return next(new ErrorResponse(`Term with id ${newTermId} does not exists`, 400))
         }

       
    }


})

// get student result
exports.getStudentResult = asyncHandler(async(req,res,next) => {
    const {studentId, sessionId, schoolId} = req.body
console.log(studentId)
    const query = {
        student: studentId,
        session: sessionId,
        school: schoolId
    }

    const result = await resultModel.findOne(query)

    if(!result){
        return next(new ErrorResponse("Result not found", 404))
    }

    return successResponse(res,200,null, result)
})