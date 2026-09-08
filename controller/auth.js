const asyncHandler = require("../middleware/async");
const ErrorResponse = require("../utils/errorResponse");
const { staffModel } = require("../models");
const { ValidatePassword } = require("../utils");
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