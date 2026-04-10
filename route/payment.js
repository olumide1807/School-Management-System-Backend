const express = require("express");
const router = express.Router();
const multiProtect = require("../middleware/multipleAuth");

const { createPayment, getPaymentsByFee, getPaymentsByStudent, deletePayment } = require("../controller/payment");

router.post("/", multiProtect(["super admin", "admin"]), createPayment);
router.get("/fee/:feeId", multiProtect(["super admin", "admin"]), getPaymentsByFee);
router.get("/student/:studentId", multiProtect(["super admin", "admin"]), getPaymentsByStudent);
router.delete("/:paymentId", multiProtect(["super admin"]), deletePayment);

module.exports = router;