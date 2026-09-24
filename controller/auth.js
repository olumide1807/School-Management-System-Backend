const asyncHandler = require("../middleware/async");
const ErrorResponse = require("../utils/errorResponse");
const { staffModel, studentModel, parentModel } = require("../models");
const { ValidatePassword, GeneratePassword } = require("../utils");
const jwt = require("jsonwebtoken");

// ============================================================
// UNIFIED STAFF LOGIN
// POST /auth/login
// body: { email, password }
// Returns: { token, role, user }
// ============================================================
exports.staffLogin = asyncHandler(async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return next(new ErrorResponse("Email and password are required", 400));
        }

        // Find staff by email
        const staff = await staffModel.findOne({ emailAddress: email }).select("+password");

        if (!staff) {
            return next(new ErrorResponse("Invalid credentials", 401));
        }

        // Check if staff is active
        if (staff.isActive === false) {
            return next(new ErrorResponse("Your account has been deactivated. Please contact the administrator.", 403));
        }

        // Validate password
        const validPassword = await ValidatePassword(password, staff.password);
        if (!validPassword) {
            return next(new ErrorResponse("Invalid credentials", 401));
        }

        // Determine role
        // isAdmin = true → "admin"
        // staffType = "academic" → "academic"
        // staffType = "non-academic" → "non-academic"
        const role = staff.isAdmin ? "admin" : staff.staffType === "academic" ? "academic" : "non-academic";

        // Generate JWT token
        const token = jwt.sign(
            {
                id: staff._id,
                schoolId: staff.schoolId,
                role,
                userType: "staff",
                firstName: staff.firstName,
                surname: staff.surname,
                staffType: staff.staffType,
                isAdmin: staff.isAdmin,
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRE || "4h" }
        );

        res.status(200).json({
            success: true,
            token,
            role,
            user: {
                _id: staff._id,
                firstName: staff.firstName,
                surname: staff.surname,
                emailAddress: staff.emailAddress,
                staffType: staff.staffType,
                isAdmin: staff.isAdmin,
                staffID: staff.staffID,
                profilePicture: staff.profilePicture,
                schoolId: staff.schoolId,
                role,
            }
        });
    } catch (err) {
        console.error("Error in staff login:", err);
        next(err);
    }
});

// ============================================================
// APPEND TO controller/auth.js
//
// Add to the imports at the top of that file:
//   const { studentModel, parentModel, staffModel } = require("../models");
//   const { ValidatePassword, GeneratePassword } = require("../utils");
// ============================================================

const signToken = (payload) =>
    jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE || "4h",
    });

// ============================================================
// STUDENT LOGIN
// POST /auth/student/login
// body: { studentID, password }
//
// Students log in with the ID printed on their card rather than an
// email, since most don't have one. The initial password is that same
// ID, which is why mustChangePassword is true until they change it.
// ============================================================
exports.studentLogin = asyncHandler(async (req, res, next) => {
    try {
        const { studentID, password } = req.body;

        if (!studentID || !password) {
            return next(new ErrorResponse("Student ID and password are required", 400));
        }

        const student = await studentModel
            .findOne({ studentID: String(studentID).trim() })
            .select("+password");

        if (!student) {
            return next(new ErrorResponse("Invalid credentials", 401));
        }

        if (student.status === "deactivated") {
            return next(new ErrorResponse(
                "This account is no longer active. Please contact the school.", 403
            ));
        }

        const validPassword = await ValidatePassword(password, student.password);
        if (!validPassword) {
            return next(new ErrorResponse("Invalid credentials", 401));
        }

        const token = signToken({
            id: student._id,
            schoolId: student.schoolId,
            role: "student",
            userType: "student",
        });

        res.status(200).json({
            success: true,
            token,
            role: "student",
            mustChangePassword: student.mustChangePassword !== false,
            user: {
                _id: student._id,
                firstName: student.firstName,
                surName: student.surName,
                studentID: student.studentID,
                classArmId: student.classArmId,
                photo: student.photo,
                schoolId: student.schoolId,
                role: "student",
            },
        });
    } catch (err) {
        console.error("Error in student login:", err);
        next(err);
    }
});

// ============================================================
// PARENT LOGIN
// POST /auth/parent/login
// body: { email, password }
// ============================================================
exports.parentLogin = asyncHandler(async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return next(new ErrorResponse("Email and password are required", 400));
        }

        const parent = await parentModel
            .findOne({ email: String(email).trim().toLowerCase() })
            .select("+password");

        if (!parent) {
            return next(new ErrorResponse("Invalid credentials", 401));
        }

        // Parents created before passwords existed have none set
        if (!parent.password) {
            return next(new ErrorResponse(
                "No password has been set for this account. Please ask the school to send you one.",
                403
            ));
        }

        const validPassword = await ValidatePassword(password, parent.password);
        if (!validPassword) {
            return next(new ErrorResponse("Invalid credentials", 401));
        }

        const token = signToken({
            id: parent._id,
            schoolId: parent.schoolId,
            role: "parent",
            userType: "parent",
        });

        res.status(200).json({
            success: true,
            token,
            role: "parent",
            mustChangePassword: parent.mustChangePassword !== false,
            user: {
                _id: parent._id,
                title: parent.title,
                firstName: parent.firstName,
                surName: parent.surName,
                email: parent.email,
                phoneNumber: parent.phoneNumber,
                schoolId: parent.schoolId,
                role: "parent",
            },
        });
    } catch (err) {
        console.error("Error in parent login:", err);
        next(err);
    }
});

// ============================================================
// CHANGE OWN PASSWORD (student or parent)
// PUT /auth/change-password
// body: { currentPassword, newPassword }
// ============================================================
exports.changeOwnPassword = asyncHandler(async (req, res, next) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return next(new ErrorResponse(
                "Current and new password are required", 400
            ));
        }
        if (String(newPassword).length < 6) {
            return next(new ErrorResponse(
                "New password must be at least 6 characters", 400
            ));
        }

        const role = req.user.role;
        const model =
            role === "student" ? studentModel : role === "parent" ? parentModel : null;

        if (!model) {
            return next(new ErrorResponse("Not available for this account type", 403));
        }

        const account = await model.findById(req.user.id).select("+password");
        if (!account) {
            return next(new ErrorResponse("Account not found", 404));
        }

        const valid = await ValidatePassword(currentPassword, account.password);
        if (!valid) {
            return next(new ErrorResponse("Current password is incorrect", 401));
        }

        const sameAsOld = await ValidatePassword(newPassword, account.password);
        if (sameAsOld) {
            return next(new ErrorResponse(
                "New password must be different from the current one", 400
            ));
        }

        account.password = await GeneratePassword(newPassword);
        account.mustChangePassword = false;
        await account.save();

        res.status(200).json({ success: true, message: "Password changed" });
    } catch (err) {
        console.error("Error changing password:", err);
        next(err);
    }
});