const asyncHandler = require("../middleware/async");
const ErrorResponse = require("../utils/errorResponse");
const { successResponse } = require("../utils/successResponse");
const { isValidMongoId } = require("../utils/isValidMongoObjectId");
const { paymentModel, feeModel, studentModel } = require("../models");
const { resolvePaymentDate } = require("../utils/paymentDate");
const { parseFeeAmount } = require("../utils/feeAmount");
const { normaliseReference, findPaymentsByReference } = require("../utils/paymentReference");

// Record a payment
exports.createPayment = asyncHandler(async (req, res, next) => {
    try {
        const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;
        const { studentId, feeId, amount, paymentMethod, reference, note, receivedBy, paymentDate } = req.body;

        if (!studentId || !feeId || amount === undefined || amount === null || amount === "") {
            return next(new ErrorResponse("studentId, feeId, and amount are required", 400));
        }

        // The same rule as fee amounts (utils/feeAmount.js), so "50,000"
        // can't become 50 here either. Zero is refused too: a ₦0 payment
        // changes nothing a parent owes and can only be a mistake.
        const amountMinor = parseFeeAmount(amount);
        if (amountMinor === null) {
            return next(new ErrorResponse(
                "Payment amount must be a plain number with at most two decimal places (e.g. 50000 or 1500.50), with no commas or currency symbols.",
                400
            ));
        }
        if (amountMinor === 0) {
            return next(new ErrorResponse("Payment amount must be more than zero.", 400));
        }

        // Required, and one of the model's methods. Defaulting to cash
        // recorded transfers as cash whenever a caller left it out.
        const methods = paymentModel.schema.path("paymentMethod").enumValues;
        if (!methods.includes(paymentMethod)) {
            return next(new ErrorResponse(
                `Payment method is required: one of ${methods.map((m) => `"${m}"`).join(", ")}`,
                400
            ));
        }

        // The form blocks future dates too; this is the check that holds
        const when = resolvePaymentDate(paymentDate);
        if (when.error) return next(new ErrorResponse(when.error, 400));

        // Verify student exists
        const student = await studentModel.findOne({ _id: studentId, schoolId });
        if (!student) return next(new ErrorResponse("Student not found", 404));

        // Verify fee exists
        const fee = await feeModel.findOne({ _id: feeId, schoolId });
        if (!fee) return next(new ErrorResponse("Fee record not found", 404));

        // Has this reference already been recorded anywhere in the school?
        // A bank line entered twice overstates what a parent has paid, and
        // they won't report it — so warn, naming the existing payment. Only
        // a warning: a reference can legitimately repeat, so the bursar can
        // confirm with confirmDuplicate: true (the boolean, not a string).
        // School-wide, not per term: the same line against the wrong term
        // is exactly the mistake worth catching. Blank references aren't
        // checked.
        const ref = typeof reference === "string" ? reference.trim() : "";
        if (ref && req.body.confirmDuplicate !== true) {
            const duplicates = await findPaymentsByReference(schoolId, ref, { maxRank: 1, limit: 5 });
            if (duplicates.length > 0) {
                const d = duplicates[0];
                const who = d.student ? `${d.student.name} (${d.student.studentID})` : "a student no longer on record";
                const when = new Date(d.paymentDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
                return res.status(409).json({
                    success: false,
                    code: "DUPLICATE_REFERENCE",
                    error: `This reference has already been recorded for ${who}: ₦${Number(d.amount).toLocaleString("en-NG")} on ${when}. If this is a separate payment, send it again with confirmDuplicate: true.`,
                    duplicates,
                });
            }
        }

        const payment = await paymentModel.create({
            studentId,
            feeId,
            schoolId,
            amount: amountMinor / 100,
            paymentMethod,
            reference: reference || "",
            note: note || "",
            receivedBy: receivedBy || "",
            paymentDate: when.date,
        });

        successResponse(res, 201, "Payment recorded successfully!", payment);
    } catch (e) {
        console.error("Error recording payment:", e);
        next(e);
    }
});

// GET /payment/search?reference=... — has this bank line been recorded?
// Loose matching (spacing, case and punctuation ignored, a cut-short
// narration still found), closest matches first. Read-only.
exports.searchPaymentsByReference = asyncHandler(async (req, res, next) => {
    try {
        const schoolId = req.user.schoolName ? req.user.id : req.user.schoolId;
        const query = typeof req.query.reference === "string" ? req.query.reference.trim() : "";

        // Too short to mean anything: "qm" would match every narration
        if (normaliseReference(query).length < 3) {
            return next(new ErrorResponse("Enter at least 3 letters or digits of the reference", 400));
        }

        const results = await findPaymentsByReference(schoolId, query);
        successResponse(res, 200, null, results);
    } catch (e) {
        console.error("Error searching payments:", e);
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