const express = require("express");
const {createFee, getFee, getFeeById, deleteFee, getFeeRoster, getStudentFeeStatement, getFeeChoices} = require("../controller/fee.js");
const multipleProtect = require("../middleware/multipleAuth");

const router = express.Router();

router.post("/", multipleProtect(["super admin", "admin"]), createFee);
router.get("/", multipleProtect(["super admin", "admin"]), getFee);
// Before /:feeId, which would otherwise take "roster" and "statement" as ids
router.get("/choices/:studentId", multipleProtect(["super admin", "admin"]), getFeeChoices);
router.get("/roster", multipleProtect(["super admin", "admin"]), getFeeRoster);
router.get("/statement/:studentId", multipleProtect(["super admin", "admin"]), getStudentFeeStatement);
router.get("/:feeId", multipleProtect(["super admin", "admin"]), getFeeById);
router.delete('/:feeId', multipleProtect(["super admin", "admin"]), deleteFee);

module.exports = router;
