const express = require("express");
const upload = require("../utils/multer");

// controllers
const {
  getProfile,
  updateProfile,
  updatePassword,
  registerSuperAdmin,
  loginSuperAdmin,
  deleteASuperAdmin,
  acceptApplication,
  photoUpload,
  deleteAccountDetails,
  revertChanges,
  getAccountDetails,
  openRegistration,
  closeRegistration
} = require("../controller/superAdmin");
const {forgotPassword, resetPassword, verifyOTP} = require('../controller/passwords');

// models
const { SuperAdminModel } = require("../models");

// middlewares
const protect = require("../middleware/auth");
const isOwner = require("../middleware/isOwner");

const router = express.Router();

// create
router.post("/register", registerSuperAdmin);

// login
router.post("/login", loginSuperAdmin);

// get
router.get("/profile", protect(SuperAdminModel), getProfile);
router.get('/account', protect(SuperAdminModel), getAccountDetails);

// update
router.put("/update", protect(SuperAdminModel), updateProfile);
router.put("/updatepassword", protect(SuperAdminModel), updatePassword);
router.put("/registration/open", protect(SuperAdminModel), openRegistration);
router.put("/registration/close", protect(SuperAdminModel), closeRegistration);

// delete
router.delete("/bank", protect(SuperAdminModel), deleteAccountDetails);
router.delete("/:id", protect(SuperAdminModel), isOwner, deleteASuperAdmin);

// accept application
router.get("/acceptApplication/:signature", acceptApplication);
router.post(
  "/upload",
  protect(SuperAdminModel),
  upload.single("file"),
  photoUpload
);

// revert update changes
router.get("/revert", protect(SuperAdminModel), revertChanges)

// passwords
router.post('/forgotpassword', forgotPassword);
router.post('/verifyOTP', verifyOTP);
router.post('/resetpassword', resetPassword);


module.exports = router;
