const express = require("express");
const isDocPdfCsv = require("../middleware/isDocPdfCsv.js");
const upload = require("../utils/multer");

const router = express.Router();

const { createTimetable, getAllTimetableEntriesInAClass, updateATimetableEntry, deleteATimetableEntry, getAllTimetable, getAllTimetablesInAClassArm, getTypeTimetables, getTypeTimetablesInAClassArm, replaceTimetableFile, deleteTimetable } = require("../controller/timetable");
const multiProtect = require("../middleware/multipleAuth");


// CREATE
router.post("/", multiProtect(["super admin", "admin"]), upload.single("file"), isDocPdfCsv, createTimetable);


// READ
// -- get all timetables in a school
router.get('/', multiProtect(["super admin", "admin"]), getAllTimetable);

// -- get all class timetables in a school
router.get('/?type=class', multiProtect(["super admin", "admin"]), getTypeTimetables);

// -- get all test timetables in a school
router.get('/?type=test', multiProtect(["super admin", "admin"]), getTypeTimetables);

// -- get all exam timetables in a school
router.get('/?type=exam', multiProtect(["super admin", "admin"]), getTypeTimetables);

// -- get the timetables in a classArm
router.get('/class/:classArmId', multiProtect(["super admin", "admin"]), getAllTimetablesInAClassArm)

// -- get all class timetables in a classArm
router.get('/class/:classArmId?type=class', multiProtect(["super admin", "admin"]), getTypeTimetablesInAClassArm)

// -- get all test timetables in a classArm
router.get('/class/:classArmId?type=test', multiProtect(["super admin", "admin"]), getTypeTimetablesInAClassArm)

// -- get all exam timetables in a classArm
router.get('/class/:classArmId?type=exam', multiProtect(["super admin", "admin"]), getTypeTimetablesInAClassArm)


// UPDATE
// - replace a class timetable for a class arm
router.put('/class/:classArmId?type=class', multiProtect(["super admin", "admin"]), upload.single("file"), isDocPdfCsv, replaceTimetableFile);

// - replace a test timetable for a class arm
router.put('/class/:classArmId?type=test', multiProtect(["super admin", "admin"]), upload.single("file"), isDocPdfCsv, replaceTimetableFile);

// - replace a exam timetable for a class arm
router.put('/class/:classArmId?type=exam', multiProtect(["super admin", "admin"]), upload.single("file"), isDocPdfCsv, replaceTimetableFile);


// DELETE
// - delete a class timetable in a class arm
router.delete('/class/:classArmId?type=class', multiProtect(["super admin", "admin"]), deleteTimetable);

// - delete a test timetable in a class arm
router.delete('/class/:classArmId?type=test', multiProtect(["super admin", "admin"]), deleteTimetable);

// - delete exam timetable in a class arm
router.delete('/class/:classArmId?type=exam', multiProtect(["super admin", "admin"]), deleteTimetable);

module.exports = router;
