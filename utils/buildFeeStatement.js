const {
    feeModel,
    paymentModel,
    termModel,
    sessionModel,
} = require("../models");
const { parseFeeAmount } = require("./feeAmount");

// ============================================================
// FEE STATEMENT FOR ONE STUDENT
//
// The only place in the backend that turns fee lists and payments into
// payable / paid / outstanding figures. Anything that shows a family or
// the school a balance should come through here, so the two can never
// disagree — the same reason buildClassReport is shared.
//
// Arithmetic is done in minor units (kobo) so sums of decimal amounts
// don't drift, and converted back to major units only on the way out.
// ============================================================

const toMinor = (n) => Math.round(Number(n) * 100);
const toMajor = (minor) => minor / 100;

// Fee item amounts are stored as numbers and validated on the way in by
// the same parseFeeAmount used here. A stored value it can't read (an
// old record, or one written around the API) marks the fee incomplete
// rather than being guessed at.
// Figures for one fee record and the payments this student made against it
const summariseFee = (fee, payments) => {
    const items = (fee.fees || []).map((item) => {
        const minor = parseFeeAmount(item.amount);
        return { description: item.description || "", amount: minor === null ? null : toMajor(minor) };
    });

    const complete = items.every((i) => i.amount !== null);
    const payableMinor = complete
        ? (fee.fees || []).reduce((sum, item) => sum + parseFeeAmount(item.amount), 0)
        : null;
    const paidMinor = payments.reduce((sum, p) => sum + toMinor(p.amount || 0), 0);

    let status;
    if (!complete) status = "unknown";
    else if (payableMinor === 0) status = "nothing_due";
    else if (paidMinor >= payableMinor) status = "paid";
    else if (paidMinor > 0) status = "part_paid";
    else status = "unpaid";

    return {
        currency: fee.currency,
        items,
        complete,
        payable: complete ? toMajor(payableMinor) : null,
        paid: toMajor(paidMinor),
        outstanding: complete ? toMajor(Math.max(payableMinor - paidMinor, 0)) : null,
        overpaid: complete ? toMajor(Math.max(paidMinor - payableMinor, 0)) : null,
        status,
    };
};

// What a family sees of a payment. The internal note and the name of the
// staff member who received it are left out.
const publicPayment = (p) => ({
    _id: p._id,
    date: p.paymentDate || p.createdAt,
    amount: toMajor(toMinor(p.amount || 0)),
    method: p.paymentMethod,
    reference: p.reference || null,
});

const byDate = (a, b) => new Date(a.paymentDate || a.createdAt) - new Date(b.paymentDate || b.createdAt);

/**
 * Fee statement for one student, scoped to one school.
 *
 * current:   the fee set for the student's current class arm in the
 *            school's current term (null if none has been set).
 * otherFees: every other fee record the student has paid against, newest
 *            term first. Fees are set per class arm and term, and nothing
 *            records which arm a student was in for a past term, so a past
 *            term with no payment on record cannot be shown — its absence
 *            here does not mean it was cleared.
 * unallocatedPayments: payments whose fee record no longer exists.
 */
async function buildFeeStatement(schoolId, studentId, classArmId) {
    const [currentTerm, payments] = await Promise.all([
        termModel.findOne({ schoolId, currentTerm: true }),
        paymentModel.find({ schoolId, studentId }),
    ]);

    const currentFee = currentTerm && classArmId
        ? await feeModel.findOne({ schoolId, termId: currentTerm._id, classArmId })
        : null;

    // Every fee this student has paid against, plus the current one
    const feeIds = [...new Set(payments.map((p) => String(p.feeId)))];
    const paidFees = feeIds.length
        ? await feeModel.find({ schoolId, _id: { $in: feeIds } })
        : [];
    const allFees = [...paidFees];
    if (currentFee && !allFees.some((f) => String(f._id) === String(currentFee._id))) {
        allFees.push(currentFee);
    }

    const terms = await termModel.find({
        schoolId,
        _id: { $in: [...new Set(allFees.map((f) => String(f.termId)))] },
    });
    const sessions = await sessionModel.find({
        schoolId,
        _id: { $in: [...new Set(terms.map((t) => String(t.sessionId)))] },
    });
    const termInfo = (termId) => {
        const t = terms.find((x) => String(x._id) === String(termId));
        const s = t && sessions.find((x) => String(x._id) === String(t.sessionId));
        return {
            termId: String(termId),
            termName: t?.termName || "Term",
            sessionName: s?.sessionName || "",
            startDate: t?.termStartDate || null,
        };
    };

    const line = (fee) => {
        const own = payments.filter((p) => String(p.feeId) === String(fee._id)).sort(byDate);
        const { startDate, ...term } = termInfo(fee.termId);
        return {
            feeId: String(fee._id),
            term,
            ...summariseFee(fee, own),
            payments: own.map(publicPayment),
            _sortDate: startDate || fee.createdAt,
        };
    };

    const strip = ({ _sortDate, ...rest }) => rest;

    const otherFees = allFees
        .filter((f) => !currentFee || String(f._id) !== String(currentFee._id))
        .map(line)
        .sort((a, b) => new Date(b._sortDate) - new Date(a._sortDate))
        .map(strip);

    const knownFeeIds = new Set(allFees.map((f) => String(f._id)));
    const unallocatedPayments = payments
        .filter((p) => !knownFeeIds.has(String(p.feeId)))
        .sort(byDate)
        .map(publicPayment);

    let currentTermInfo = null;
    if (currentTerm) {
        const session = await sessionModel.findOne({ schoolId, _id: currentTerm.sessionId });
        currentTermInfo = {
            termId: String(currentTerm._id),
            termName: currentTerm.termName,
            sessionName: session?.sessionName || "",
        };
    }

    return {
        currentTerm: currentTermInfo,
        current: currentFee ? strip(line(currentFee)) : null,
        otherFees,
        unallocatedPayments,
    };
}

module.exports = { buildFeeStatement, summariseFee, parseFeeAmount };
