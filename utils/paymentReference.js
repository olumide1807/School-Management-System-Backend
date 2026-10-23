const {
    paymentModel,
    studentModel,
    feeModel,
    termModel,
    sessionModel,
} = require("../models");

// ============================================================
// PAYMENT REFERENCES
//
// A reference is usually a bank narration copied off a statement, e.g.
// "QM/9016 ABDULBASIT ALA". A bursar retyping it won't reproduce spacing,
// case or punctuation exactly, so references are compared in a normal
// form: lowercase letters and digits only. The lookup and the duplicate
// warning both use normaliseReference, so they can't disagree about what
// "the same reference" means.
// ============================================================

const normaliseReference = (ref) => String(ref || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const words = (ref) => String(ref || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 2);

// How closely a recorded reference matches what's being looked up.
// Lower is closer; null is no match.
//   0  identical as recorded (ignoring surrounding spaces)
//   1  the same once spacing, case and punctuation are ignored
//   2  one contains the other — bank narrations are often cut short
//   3  every word looked up appears in it, in any order
const matchRank = (recorded, query) => {
    if (String(recorded).trim() === String(query).trim()) return 0;
    const r = normaliseReference(recorded);
    const q = normaliseReference(query);
    if (!r || !q) return null;
    if (r === q) return 1;
    if (r.includes(q) || q.includes(r)) return 2;
    const qw = words(query);
    if (qw.length > 0 && qw.every((w) => r.includes(w))) return 3;
    return null;
};

// What a bursar needs to recognise a payment
async function describePayments(schoolId, payments) {
    const studentIds = [...new Set(payments.map((p) => String(p.studentId)))];
    const feeIds = [...new Set(payments.map((p) => String(p.feeId)))];
    const [students, fees] = await Promise.all([
        studentModel.find({ schoolId, _id: { $in: studentIds } }).select("firstName surName otherName studentID"),
        feeModel.find({ schoolId, _id: { $in: feeIds } }).select("termId"),
    ]);
    const terms = await termModel.find({
        schoolId,
        _id: { $in: [...new Set(fees.map((f) => String(f.termId)))] },
    }).select("termName sessionId");
    const sessions = await sessionModel.find({
        schoolId,
        _id: { $in: [...new Set(terms.map((t) => String(t.sessionId)))] },
    }).select("sessionName");

    return payments.map((p) => {
        const s = students.find((x) => String(x._id) === String(p.studentId));
        const f = fees.find((x) => String(x._id) === String(p.feeId));
        const t = f && terms.find((x) => String(x._id) === String(f.termId));
        const ss = t && sessions.find((x) => String(x._id) === String(t.sessionId));
        return {
            _id: p._id,
            reference: p.reference,
            amount: p.amount,
            paymentDate: p.paymentDate || p.createdAt,
            paymentMethod: p.paymentMethod,
            student: s
                ? {
                    _id: s._id,
                    name: [s.firstName, s.otherName, s.surName].filter(Boolean).join(" "),
                    studentID: s.studentID,
                }
                : null,
            term: t
                ? { termId: t._id, termName: t.termName, sessionName: ss?.sessionName || "" }
                : null,
        };
    });
}

/**
 * Payments in this school whose reference matches `query`, closest first.
 * `maxRank` limits how loose a match counts: 1 for "the same reference",
 * 3 for a search. Filtering happens here rather than in the query because
 * matching is on the normalised form; a school's payments with a
 * reference are few enough for that. If that stops being true, store the
 * normalised form on the payment and index it.
 */
async function findPaymentsByReference(schoolId, query, { maxRank = 3, limit = 25 } = {}) {
    const candidates = await paymentModel
        .find({ schoolId, reference: { $nin: [null, ""] } })
        .select("studentId feeId amount paymentMethod reference paymentDate createdAt");

    const ranked = candidates
        .map((p) => ({ p, rank: matchRank(p.reference, query) }))
        .filter((x) => x.rank !== null && x.rank <= maxRank)
        .sort((a, b) =>
            a.rank - b.rank ||
            new Date(b.p.paymentDate || b.p.createdAt) - new Date(a.p.paymentDate || a.p.createdAt))
        .slice(0, limit);

    const described = await describePayments(schoolId, ranked.map((x) => x.p));
    return described.map((d, i) => ({ ...d, match: ranked[i].rank <= 1 ? "exact" : "close" }));
}

module.exports = { normaliseReference, matchRank, findPaymentsByReference };
