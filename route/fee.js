const express = require("express");
const {createFee, getFee, getFeeById, deleteFee} = require("../controller/fee.js");
const multiProtect = require("../middleware/multipleAuth");

const router = express.Router();

router.post("/", multiProtect(["super admin"]), createFee);
router.get("/", multiProtect(["super admin"]), getFee);
router.get("/:feeId", multiProtect(["super admin"]), getFeeById);
router.delete('/:feeId', multiProtect(["super admin"]), deleteFee);

module.exports = router;
