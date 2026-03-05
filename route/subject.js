const express = require("express");
const {
  createSubject,
  createSpecificSubject,
  getAllSubject,
  getAllSubjectInAClass,
  getSubjectById,
  getAllSpecificSubjectsUnderASubject,
  editSubject,
  deleteSubject,
  editSpecificSubject
} = require("../controller/subject");
const multipleProtect = require("../middleware/multipleAuth");
const router = express.Router();

// create subjects
router.post(
  "/",
  multipleProtect(["super admin", "admin"]),
  createSubject
);

router.post(
  "/:classArmId",
  multipleProtect(["super admin", "admin"]),
  createSpecificSubject
);

// READ
// get all subjects
router.get(
  "/",
  multipleProtect(["super admin", "admin", "academic"]),
  getAllSubject
);

// get all subjects in a specific class
router.get(
  "/all/:classArmId",
  multipleProtect(["super admin", "admin", "academic"]),
  getAllSubjectInAClass
);

// get list of specific subjects under a subject
router.get(
  "/:subjectId/all",
  multipleProtect(["super admin", "admin", "academic"]),
  getAllSpecificSubjectsUnderASubject
);

// get a subject/specific subject by Id
router.get(
  "/:id",
  multipleProtect(["super admin", "admin", "academic"]),
  getSubjectById
);

//UPDATE

// update a subject or specific subject
router.put("/specific/:id", multipleProtect(["super admin", "admin"]), editSpecificSubject);
router.put("/:id", multipleProtect(["super admin", "admin"]), editSubject);

// DELETE

// delete a subject or specific subject
router.delete("/:id", multipleProtect(["super admin", "admin"]), deleteSubject);

module.exports = router;
