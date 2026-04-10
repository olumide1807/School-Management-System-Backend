const asyncHandler = require("../middleware/async");
const ErrorResponse = require("../utils/errorResponse");
const { successResponse } = require("../utils/successResponse");
const { isValidMongoId } = require("../utils/isValidMongoObjectId");
const { paymentModel, feeModel, studentModel } = require("../models");

// Record a payment
exports.createPayment = asyncHandler(async (req, res, next) => {
    try {
        const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;
        const { studentId, feeId, amount, paymentMethod, reference, note, receivedBy, paymentDate } = req.body;

        if (!studentId || !feeId || !amount) {
            return next(new ErrorResponse("studentId, feeId, and amount are required", 400));
        }

        // Verify student exists
        const student = await studentModel.findOne({ _id: studentId, schoolId });
        if (!student) return next(new ErrorResponse("Student not found", 404));

        // Verify fee exists
        const fee = await feeModel.findOne({ _id: feeId, schoolId });
        if (!fee) return next(new ErrorResponse("Fee record not found", 404));

        const payment = await paymentModel.create({
            studentId,
            feeId,
            schoolId,
            amount: Number(amount),
            paymentMethod: paymentMethod || "cash",
            reference: reference || "",
            note: note || "",
            receivedBy: receivedBy || "",
            paymentDate: paymentDate || new Date(),
        });

        successResponse(res, 201, "Payment recorded successfully!", payment);
    } catch (e) {
        console.error("Error recording payment:", e);
        next(e);
    }
});

// Get all payments for a fee (all students)
exports.getPaymentsByFee = asyncHandler(async (req, res, next) => {
    try {
        const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;
        const { feeId } = req.params;

        const payments = await paymentModel.find({ feeId, schoolId });
        successResponse(res, 200, null, payments);
    } catch (e) {
        console.error("Error getting payments:", e);
        next(e);
    }
});

// Get all payments for a student
exports.getPaymentsByStudent = asyncHandler(async (req, res, next) => {
    try {
        const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;
        const { studentId } = req.params;

        const payments = await paymentModel.find({ studentId, schoolId });
        successResponse(res, 200, null, payments);
    } catch (e) {
        console.error("Error getting student payments:", e);
        next(e);
    }
});

// Delete a payment
exports.deletePayment = asyncHandler(async (req, res, next) => {
    try {
        const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;
        const { paymentId } = req.params;

        const result = await paymentModel.findOneAndDelete({ _id: paymentId, schoolId });
        if (!result) return next(new ErrorResponse("Payment not found", 404));

        successResponse(res, 200, "Payment deleted successfully!");
    } catch (e) {
        console.error("Error deleting payment:", e);
        next(e);
    }
});