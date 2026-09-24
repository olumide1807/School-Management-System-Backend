// middlewares
const { asyncHandler } = require("../middleware");
const { validateCreateParent, validateLinkStudent, validateEditParent } = require("../middleware/validation");

// utils
const ErrorResponse = require("../utils/errorResponse");
const { createParent } = require("../utils/createParent");
const { successResponse } = require("../utils/successResponse");

const { GeneratePassword } = require("../utils");
const sendEmail = require("../utils/sendgrid");

// models
const {
    studentModel,
    parentModel,
} = require("../models");

exports.createParent = asyncHandler(async (req, res, next) => {
    try {
        // validate request body
        const { error } = validateCreateParent(req.body);

        if (error) return next(new ErrorResponse(error.details[0].message, 400))

        // extract schoolId
        const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;

        // destructure request body
        const { email, studentID, relationship } = req.body;
        req.body.schoolId = schoolId;

        // Parents log in with their email, so they need a password.
        // Generated here and emailed; they must change it on first login.
        const plainPassword = Math.random().toString(36).substring(2, 10);
        req.body.password = await GeneratePassword(plainPassword);

        // create parent
        const parent = await createParent(email, schoolId, parentModel, req.body);

        if (!parent) {
            return next(new ErrorResponse(`parent with this email: ${email} already exists in your school`, 400))
        }

        try {
            const message = `An account has been created for you on the school portal.\nYour email is ${parent.email} and your password is ${plainPassword}.\nYou'll be asked to change it when you first sign in.`;
            // await sendEmail(parent.email, "School Portal - Account Created", message, `<p>${message}</p>`);
            // TODO: email this once SendGrid is configured
            console.log(`Parent created. Email: ${parent.email} · Password: ${plainPassword}`);
        } catch (emailErr) {
            console.log("Parent email failed. Password:", plainPassword);
        }

        if (studentID) {
            if (!relationship) {
                return next(new ErrorResponse(`you didn't indicate the relationship the student has with the parent. Anyways the parent has been created successfully 🥳. You can always link the student directly to the parent.`, 400))
            }

            // check if the student exists in the school
            const student = await studentModel.findOne({ _id: studentID, schoolId });

            // no? return error
            if (!student) return next(new ErrorResponse(`the student you are trying to link to the parent doesn't exist in the school.\nAnyways the parent has been created successfully 🥳. You can always link student directly to the parent.`, 400));

            // otherwise, update the student info
            student.guardians.push({ parentId: parent.id, relationship });

            // update the parent
            parent.type = "linked";
            await parent.save();

            await student.save();
        }

        return res.status(201).json({
            success: true,
            message: "parent has been created successfully",
            data: parent,
            initialPassword: plainPassword,
        });

    } catch (e) {
        console.error(`Error creating parent: ${e}`);
        return next(new ErrorResponse("Error creating parent, please try again later", 500));
    }
})

exports.editParent = asyncHandler(async (req, res, next) => {
    try {
        // validate request body
        const { error } = validateEditParent(req.body);

        if (error) return next(new ErrorResponse(error.details[0].message, 400))

        // extract the schoolId
        const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;

        // destructure the query params
        const { id } = req.params;

        // does the parent exist?
        const parent = await parentModel.findOne({
            _id: id,
            schoolId
        })

        // no? return error
        if (!parent) return next(new ErrorResponse(`parent with id: ${id} doesn't exist`, 400));

        // otherwise, update
        await parentModel.findByIdAndUpdate(id, req.body);

        res.status(200).json({
            success: true,
            message: "Parent has been updated successfully"
        })

    } catch (e) {
        console.error(`Error editing parent: ${e}`);
        return next(new ErrorResponse("Error editing parent, please try again later", 500));
    }
})

exports.linkStudent = asyncHandler(async (req, res, next) => {
    try {
        // validate request body
        const { error } = validateLinkStudent(req.body);

        if (error) return next(new ErrorResponse(error.details[0].message, 400))

        // extract the schoolId
        const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;

        // destructure the request body
        const { studentID, relationship } = req.body;

        // destructure the params
        const { id } = req.params;

        // does parent exist?
        const parent = await parentModel.findOne({
            _id: id,
            schoolId
        })

        // no? return error
        if (!parent) return next(new ErrorResponse(`Parent with id: ${id} does not exist in your school`, 400))

        // otherwise, does student exist?
        const student = await studentModel.findOne({
            _id: studentID,
            schoolId
        });

        // no? return error
        if (!student) return next(new ErrorResponse(`student with id: ${studentID} does not exist in your school`))

        // otherwise, update student
        student.guardians.push({
            parentId: id,
            relationship
        });

        // update parent
        parent.type = "linked";
        await parent.save()

        // save to the database
        await student.save();

        return res.status(200).json({
            success: true,
            message: "student has been linked successfully to the parent"
        })
    } catch (e) {
        console.error(`Error linking student: ${e}`);
        return next(new ErrorResponse("Error linking student, please try again later", 500));
    }
})

exports.deleteParent = asyncHandler(async (req, res, next) => {
    try {
        // extract the schoolId
        const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;

        // destructure the params
        const { id } = req.params;

        // does parent exist?
        const parent = await parentModel.findOne({
            _id: id,
            schoolId
        })

        // no? return error
        if (!parent) return next(new ErrorResponse(`Parent with id: ${id} does not exist in your school`, 400))

        // otherwise, delete parent
        await parentModel.findByIdAndDelete(id);

        return res.status(200).json({
            success: true,
            message: "Parent has successfully been deleted"
        })
    } catch (e) {
        console.error(`Error deleting parent: ${e}`);
        return next(new ErrorResponse("Error deleting parent, please try again later", 500));
    }
})

exports.getAllParents = asyncHandler(async (req, res, next) => {
    try {
        // extract the schoolId
        const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;

        // set search
        let search = {
            schoolId
        }

        if (req.query.isLinked) {
            search.isLinked = req.query.isLinked;
        }

        console.log(search);

        const parents = await parentModel.find(search);

        // send successResponse
        successResponse(res, 200, null, parents);
    } catch (err) {
        console.error("Error getting all parents", err);
        next(err);
    }
});

exports.updateParent = asyncHandler(async (req, res, next) => {
    try {
        const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;
        const { id } = req.params;

        const parent = await parentModel.findOne({ _id: id, schoolId });
        if (!parent) {
            return next(new ErrorResponse("Parent not found", 404));
        }

        const allowedFields = [
            'title', 'firstName', 'surName', 'email',
            'phoneNumber', 'occupation', 'country',
            'stateOfOrigin', 'localGovernmentArea', 'address'
        ];

        allowedFields.forEach(field => {
            if (req.body[field] !== undefined) {
                parent[field] = req.body[field];
            }
        });

        await parent.save();
        successResponse(res, 200, "Parent updated successfully", parent);
    } catch (error) {
        console.error("Error updating parent:", error);
        next(error);
    }
});

// PUT /parent/:id/reset-password — admin-triggered
exports.resetParentPassword = asyncHandler(async (req, res, next) => {
    try {
        const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;
        const parent = await parentModel.findOne({ _id: req.params.id, schoolId });
        if (!parent) return next(new ErrorResponse("Parent not found", 404));

        const plainPassword = Math.random().toString(36).substring(2, 10);
        parent.password = await GeneratePassword(plainPassword);
        parent.mustChangePassword = true;
        await parent.save();

        try {
            const message = `Your school portal password has been reset.\nYour new password is ${plainPassword}.`;
            await sendEmail(parent.email, "School Portal - Password Reset", message, `<p>${message}</p>`);
        } catch (e) {
            console.log("Reset email failed. Password:", plainPassword);
        }

        successResponse(res, 200, "Password reset and emailed", { newPassword: plainPassword });
    } catch (e) {
        console.error("Error resetting parent password:", e);
        next(e);
    }
});