const express = require("express");
const isFile = require("../middleware/isFile");
const upload = require("../utils/multer");

const multipleProtect = require("../middleware/multipleAuth");
const router = express.Router();

const { registerStudent, linkNewParent, deleteStudent, deactivateStudent, activateStudent, editStudent, getAllStudents, createAttendance, updateAttendance, deleteAttendance, getAllStudentAttendance, getStudentAttendance, getAllStudentsInAClass } = require("../controller/student");
const {createResult} = require('../controller/result')

// read all student
router.get("/", multipleProtect(["super admin", "admin"]), getAllStudents);

// get all students in a specific class
router.get('/class/:classArmId', multipleProtect(["super admin", "staff", "admin"]), getAllStudentsInAClass)

// get all students' attendance by query
router.get('/attendance', multipleProtect(["super admin", "staff", "admin"]), getAllStudentAttendance);

// get a particular student attendance
router.get('/attendance/:id', multipleProtect(["super admin", "staff", "admin"]), getStudentAttendance);

// register student
router.post("/register", multipleProtect(["super admin", "admin"]),upload.single("file"), isFile, registerStudent);

// create student attendance
router.post("/attendance", multipleProtect(["super admin", "staff"]), createAttendance);

// link parent/guardian
router.put("/guardian/link/:id", multipleProtect(["super admin", "admin"]), linkNewParent);

// activate a student
router.put("/activate/:id", multipleProtect(["super admin", "admin"]), activateStudent)

// deactivate a student
router.put("/deactivate/:id", multipleProtect(["super admin", "admin"]), deactivateStudent)

// edit attendance
router.put("/attendance/:id", multipleProtect(["super admin", "staff"]), updateAttendance)

// edit a student
router.put("/:id", multipleProtect(["super admin", "admin"]), editStudent);

// delete a student attendance
router.delete("/attendance/:id", multipleProtect(["super admin", "staff"]), deleteAttendance)

// delete student
router.delete("/:id", multipleProtect(["super admin", "admin"]), deleteStudent);

// result

router.post('/upload-result',createResult)

module.exports = router;
