const express = require("express");
const {createFee, getFee, getFeeById, deleteFee} = require("../controller/fee.js");
const multipleProtect = require("../middleware/multipleAuth");

const router = express.Router();

router.post("/", multipleProtect(["super admin", "admin"]), createFee);
router.get("/", multipleProtect(["super admin", "admin"]), getFee);
router.get("/:feeId", multipleProtect(["super admin", "admin"]), getFeeById);
router.delete('/:feeId', multipleProtect(["super admin", "admin"]), deleteFee);

module.exports = router;
