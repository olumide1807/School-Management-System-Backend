const { Router } = require("express");
const { createStaff, getAdminStaffs, Login, getStaffById, updateStaff, updateStaffPassword, makeAdmin, removeAdmin, assignClass, createAttendance, getAllStaffAttendance, updateAttendance, deleteAttendance, getStaffAttendance, getAllStaffs } = require("../controller/staff");
const {adminModel, SuperAdminModel, staffModel} = require("../models");
const multipleProtect = require("../middleware/multipleAuth");
const Protect = require("../middleware/auth");
const isOwner = require("../middleware/isOwner");
const isFile = require("../middleware/isFile");
const upload = require("../utils/multer");

const router = Router();

// get
router.get('/', multipleProtect(["super admin", "admin"]), getAllStaffs)
router.get('/admin', multipleProtect(["super admin", "admin"]), getAdminStaffs);
router.get('/attendance', multipleProtect(["super admin", "admin", "staff"]), getAllStaffAttendance);
router.get('/attendance/:id', multipleProtect(["super admin", "admin", "staff"]), getStaffAttendance)
router.get('/:id', multipleProtect(["super admin", "admin", "academic", "non-academic"]), getStaffById);

// post
router.post('/', multipleProtect(["super admin", "admin"]), upload.single("file"), isFile, createStaff);
router.post('/login', Login);
router.post('/attendance', multipleProtect(["super admin", "admin"]), createAttendance);

// put
router.put('/makeAdmin/:id', Protect(SuperAdminModel), makeAdmin);
router.put('/removeAdmin/:id', Protect(SuperAdminModel), removeAdmin);
router.put('/assignClass/:classArmId', multipleProtect(["super admin", "admin"]), assignClass);
router.put('/attendance/:id', multipleProtect(["super admin", "admin"]), updateAttendance);
router.put('/:id/password', Protect(staffModel), isOwner, updateStaffPassword);
router.put('/:id', Protect(staffModel), isOwner, updateStaff);

// delete
router.delete('attendance/:id', multipleProtect(["super admin", "admin"]), deleteAttendance);




module.exports = router;