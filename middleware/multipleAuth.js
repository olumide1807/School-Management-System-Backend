const jwt = require("jsonwebtoken");
const ErrorResponse = require("../utils/errorResponse");
const { SuperAdminModel, staffModel, studentModel, parentModel } = require("../models");

/**
 * Role-based auth middleware.
 *
 * Accepts an array of allowed roles. Supported roles:
 *  - "super admin"   → matches SuperAdmin user
 *  - "admin"         → matches staff with isAdmin: true
 *  - "academic"      → matches staff with staffType: "academic"
 *  - "non-academic"  → matches staff with staffType: "non-academic"
 *  - "staff"         → matches ANY staff (legacy; prefer specific roles)
 *  - "student"       → matches Student user
 *  - "parent"        → matches Parent user
 *
 * IMPORTANT: Super admins ALWAYS have access to all routes (they own the school).
 * There's no need to explicitly include "super admin" in allowedRoles for them to pass.
 *
 * On success, attaches:
 *   req.user           → the user document
 *   req.user.role      → the specific role ("super admin", "admin", "academic", ...)
 *   req.user.userType  → LEGACY: "admin" for super admin/staff admin, "staff" for other staff, "student", "parent"
 *                        Kept for backwards compatibility with existing controllers
 */
const protect = (allowedRoles) => async (req, res, next) => {
  let token = req.signedCookies?.["token"];

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token || token.trim() === "") {
    return next(new ErrorResponse("Unauthorized! Please sign up or log in", 401));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    let user = null;
    let resolvedRole = null;
    let legacyUserType = null;

    // 1. Try SuperAdmin first — they ALWAYS pass (they own the school)
    const superAdmin = await SuperAdminModel.findOne({ _id: decoded.id });
    if (superAdmin) {
      user = superAdmin;
      resolvedRole = "super admin";
      legacyUserType = "admin"; // LEGACY: old code treats super admin as "admin"
    }

    // 2. Try Staff
    if (!user) {
      const staff = await staffModel.findOne({ _id: decoded.id });
      if (staff) {
        // Determine the staff's actual role
        let staffRole;
        if (staff.isAdmin) {
          staffRole = "admin";
        } else if (staff.staffType === "academic") {
          staffRole = "academic";
        } else if (staff.staffType === "non-academic") {
          staffRole = "non-academic";
        } else {
          staffRole = "staff"; // fallback
        }

        // Check if the staff's role is allowed for this route
        // "staff" in allowedRoles means ANY staff type is allowed (legacy)
        const isAllowed =
          allowedRoles.includes(staffRole) ||
          allowedRoles.includes("staff") ||
          // Admins can also access academic/non-academic routes
          (staffRole === "admin" &&
            (allowedRoles.includes("academic") || allowedRoles.includes("non-academic")));

        if (!isAllowed) {
          return next(new ErrorResponse("Not authorized to access this route", 403));
        }

        user = staff;
        resolvedRole = staffRole;
        // LEGACY: old code used "staff" for all staff types
        // Staff admins should appear as "admin" in legacy userType
        legacyUserType = staffRole === "admin" ? "admin" : "staff";
      }
    }

    // 3. Try Student
    if (!user) {
      const student = await studentModel.findOne({ _id: decoded.id });
      if (student) {
        if (!allowedRoles.includes("student")) {
          return next(new ErrorResponse("Not authorized to access this route", 403));
        }
        user = student;
        resolvedRole = "student";
        legacyUserType = "student";
      }
    }

    // 4. Try Parent
    if (!user) {
      const parent = await parentModel.findOne({ _id: decoded.id });
      if (parent) {
        if (!allowedRoles.includes("parent")) {
          return next(new ErrorResponse("Not authorized to access this route", 403));
        }
        user = parent;
        resolvedRole = "parent";
        legacyUserType = "parent";
      }
    }

    // If no user found, token belongs to a deleted/invalid account
    if (!user) {
      return next(new ErrorResponse("User not found. Please log in again", 401));
    }

    // Attach user, role, and legacy userType to the request object
    req.user = user;
    req.user.role = resolvedRole;
    req.user.userType = legacyUserType;

    next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    return next(new ErrorResponse(`Error verifying authorization: ${err.message}`, 401));
  }
};

module.exports = protect;