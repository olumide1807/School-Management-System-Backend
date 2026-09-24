const express = require("express");
const { staffLogin, studentLogin, parentLogin, changeOwnPassword } = require("../controller/auth");
const multipleProtect = require("../middleware/multipleAuth");

const router = express.Router();

// Unified staff login (admin, academic, non-academic)
router.post("/login", staffLogin);
router.post("/student/login", studentLogin);
router.post("/parent/login", parentLogin);
router.put("/change-password", multipleProtect(["student", "parent"]), changeOwnPassword);

module.exports = router;