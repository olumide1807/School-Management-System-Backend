const express = require("express");
const { staffLogin } = require("../controller/auth");

const router = express.Router();

// Unified staff login (admin, academic, non-academic)
router.post("/login", staffLogin);

module.exports = router;