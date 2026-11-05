const {
    feeModel,
    paymentModel,
    termModel,
    sessionModel,
    classArmModel,
    classLevelModel,
    studentModel,
} = require("../models");
const { parseFeeAmount } = require("./feeAmount");
const { toDayStart } = require("./schoolDay");

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

// "JSS1 B" for a class arm, from arms and levels already loaded
const classLabeller = (arms, levels) => (armId) => {
    const arm = arms.find((a) => String(a._id) === String(armId));
    if (!arm) return null;
    const level = levels.find((l) => String(l._id) === String(arm.classLevelId));
    return `${level?.levelShortName || ""} ${(arm.armName || "").toUpperCase()}`.trim() || null;
};

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

    // The class each fee was set for — not the student's current class,
    // which changes on promotion. A receipt for last term's JSS1 fee must
    // say JSS1 even after the child moves to JSS2.
    const arms = await classArmModel.find({
        schoolId,
        _id: { $in: [...new Set(allFees.map((f) => String(f.classArmId)))] },
    });
    const levels = await classLevelModel.find({
        schoolId,
        _id: { $in: [...new Set(arms.map((a) => String(a.classLevelId)))] },
    });
    const classLabelOf = classLabeller(arms, levels);
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
            classLabel: classLabelOf(fee.classArmId),
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

// ============================================================
// FEE ROSTER: EVERY STUDENT IN ONE TERM
//
// The school's lists, dashboard and class breakdowns need one term's
// figures for many students at once. Calling buildFeeStatement per student
// would be one round of queries per child, so this loads the term in a few
// queries — but every figure still comes from summariseFee, the same as a
// statement. test/feeRoster.test.js checks each row against
// buildFeeStatement for the same student.
//
// Who is listed for a class: everyone in it now, plus anyone who paid
// against its fee for this term and has since moved. Nothing records which
// class a student was in for a past term (promotion overwrites classArmId),
// so a payment is the only evidence. Movers are listed with inClass:false
// and nowIn naming their current class.
//
// A past term (ended, not active) has a catch: someone in the class now
// with no payment against its fee may not have been in the class then, so
// a balance would be a debt nobody can show they owe — and their parent's
// statement has no such line. They get status "no_record": listed, paid
// 0, no payable or outstanding. Anyone with a payment is a real line.
//
// Rows:   one per student per class they're listed under. A student in a
//         class with no fee for the term gets status "no_fee".
// Counts: per class and in total, by status, over students in the class
//         now (inClass) — so each student is counted once — leaving out
//         deactivated students: someone who has left doesn't make this
//         term look more outstanding. They stay in the rows (studentStatus);
//         the incomplete-scores check in controller/result.js leaves them
//         out the same way.
// ============================================================

const STATUSES = ["unpaid", "part_paid", "paid", "nothing_due", "unknown", "no_fee", "no_record"];
const emptyCounts = () => Object.fromEntries([["students", 0], ...STATUSES.map((s) => [s, 0])]);

async function buildFeeRoster(schoolId, termId, { classLevelId, now = new Date() } = {}) {
    const term = await termModel.findOne({ schoolId, _id: termId });
    const past = !!term && !term.currentTerm && !!term.termEndDate && toDayStart(term.termEndDate) < toDayStart(now);

    const arms = await classArmModel.find(classLevelId ? { schoolId, classLevelId } : { schoolId });
    const armIds = arms.map((a) => a._id);
    const fees = await feeModel.find({ schoolId, termId, classArmId: { $in: armIds } });
    const payments = await paymentModel.find({ schoolId, feeId: { $in: fees.map((fee) => fee._id) } });

    const payerIds = [...new Set(payments.map((p) => String(p.studentId)))];
    const students = await studentModel
        .find({ schoolId, $or: [{ classArmId: { $in: armIds } }, { _id: { $in: payerIds } }] })
        .select("firstName surName otherName studentID classArmId status");

    // Movers can be in a class outside this level; label them too
    const otherArmIds = [...new Set(students.map((s) => String(s.classArmId)))]
        .filter((id) => !arms.some((a) => String(a._id) === id));
    const allArms = otherArmIds.length
        ? [...arms, ...(await classArmModel.find({ schoolId, _id: { $in: otherArmIds } }))]
        : arms;
    const levels = await classLevelModel.find({
        schoolId,
        _id: { $in: [...new Set(allArms.map((a) => String(a.classLevelId)))] },
    });
    const classLabelOf = classLabeller(allArms, levels);

    const feeForArm = (armId) => fees.find((fee) => String(fee.classArmId) === String(armId)) || null;
    const row = (student, armId, fee) => {
        const inClass = String(student.classArmId) === String(armId);
        const base = {
            studentId: String(student._id),
            studentID: student.studentID || "",
            name: [student.firstName, student.otherName, student.surName].filter(Boolean).join(" "),
            studentStatus: student.status,
            classArmId: String(armId),
            classLabel: classLabelOf(armId),
            inClass,
            nowIn: inClass ? null : classLabelOf(student.classArmId),
        };
        if (!fee) {
            return { ...base, feeId: null, currency: null, complete: true, payable: null, paid: null, outstanding: null, overpaid: null, status: "no_fee" };
        }
        const own = payments.filter((p) => String(p.feeId) === String(fee._id) && String(p.studentId) === String(student._id));
        if (past && own.length === 0) {
            return { ...base, feeId: String(fee._id), currency: fee.currency, complete: true, payable: null, paid: 0, outstanding: null, overpaid: null, status: "no_record" };
        }
        const { items, ...figures } = summariseFee(fee, own);
        return { ...base, feeId: String(fee._id), ...figures };
    };

    const rows = [];
    for (const student of students) {
        const here = arms.find((a) => String(a._id) === String(student.classArmId));
        if (here) rows.push(row(student, here._id, feeForArm(here._id)));
        // Fees in this term they paid against, for a class they've left
        for (const fee of fees) {
            if (String(fee.classArmId) === String(student.classArmId)) continue;
            if (payments.some((p) => String(p.feeId) === String(fee._id) && String(p.studentId) === String(student._id))) {
                rows.push(row(student, fee.classArmId, fee));
            }
        }
    }
    rows.sort((a, b) =>
        (a.classLabel || "").localeCompare(b.classLabel || "") ||
        Number(b.inClass) - Number(a.inClass) ||
        a.name.localeCompare(b.name));

    const total = emptyCounts();
    const classes = arms.map((arm) => ({ classArmId: String(arm._id), classLabel: classLabelOf(arm._id), hasFee: !!feeForArm(arm._id), counts: emptyCounts() }));
    for (const r of rows.filter((x) => x.inClass && x.studentStatus !== "deactivated")) {
        const cls = classes.find((c) => c.classArmId === r.classArmId);
        for (const counts of [total, cls.counts]) {
            counts.students += 1;
            counts[r.status] += 1;
        }
    }
    classes.sort((a, b) => (a.classLabel || "").localeCompare(b.classLabel || ""));

    return { rows, counts: total, classes };
}

// ============================================================
// FEES A PAYMENT CAN BE RECORDED AGAINST
//
// A payment is a (student, fee) pair: a child promoted last term can still
// pay last term's fee, which belongs to a class they've left. So this is
// every fee in the school, each saying which class, term and session it's
// for, since choosing the wrong one is the mistake to guard against.
//
// Each choice gives the fee's amount and what this student has paid against
// it, not a balance or status: nothing records which class they were in for
// another term, so most of these aren't debts anyone can show they owe.
//
// Newest term first; within a term, the student's current class first.
// ============================================================
async function buildFeeChoices(schoolId, student) {
    const [fees, payments] = await Promise.all([
        feeModel.find({ schoolId }),
        paymentModel.find({ schoolId, studentId: student._id }),
    ]);
    const terms = await termModel.find({ schoolId, _id: { $in: [...new Set(fees.map((f) => String(f.termId)))] } });
    const sessions = await sessionModel.find({ schoolId, _id: { $in: [...new Set(terms.map((t) => String(t.sessionId)))] } });
    const arms = await classArmModel.find({ schoolId, _id: { $in: [...new Set(fees.map((f) => String(f.classArmId)))] } });
    const levels = await classLevelModel.find({ schoolId, _id: { $in: [...new Set(arms.map((a) => String(a.classLevelId)))] } });
    const classLabelOf = classLabeller(arms, levels);

    return fees
        .map((fee) => {
            const t = terms.find((x) => String(x._id) === String(fee.termId));
            const s = t && sessions.find((x) => String(x._id) === String(t.sessionId));
            const own = payments.filter((p) => String(p.feeId) === String(fee._id));
            const { currency, complete, payable, paid } = summariseFee(fee, own);
            return {
                feeId: String(fee._id),
                term: { termId: String(fee.termId), termName: t?.termName || "Term", sessionName: s?.sessionName || "" },
                classArmId: String(fee.classArmId),
                classLabel: classLabelOf(fee.classArmId),
                isCurrentClass: String(fee.classArmId) === String(student.classArmId),
                currency, complete, payable, paid,
                _sortDate: t?.termStartDate || fee.createdAt,
            };
        })
        .sort((a, b) =>
            new Date(b._sortDate) - new Date(a._sortDate) ||
            Number(b.isCurrentClass) - Number(a.isCurrentClass) ||
            (a.classLabel || "").localeCompare(b.classLabel || ""))
        .map(({ _sortDate, ...choice }) => choice);
}

module.exports = { buildFeeStatement, buildFeeRoster, buildFeeChoices, summariseFee, parseFeeAmount, STATUSES };
