// Recording a payment (POST /payment).
//
// Amount: a plain number, at most two decimals, more than zero — the same
// rule as fee amounts (utils/feeAmount.js). "50,000" must be refused, not
// read as 50. Method: required, one of the model's methods; a missing one
// used to be recorded as cash.
//
// Duplicate reference: a bank line entered twice overstates what a parent
// has paid, so a reference already recorded anywhere in the school — once
// spacing, case and punctuation are ignored — gets a 409 naming the
// existing payment. The bursar can go ahead with confirmDuplicate: true
// (the boolean only).
const M = require("../models");
const payment = require("../controller/payment");
const { useTestDatabase } = require("./helpers/db");
const { run, asSchool } = require("./helpers/http");
const f = require("./helpers/factories");

useTestDatabase();

async function world() {
    const school = f.id();
    const arm = await f.classArm(school);
    const sess = await f.session(school);
    const term = await f.term(school, sess._id);
    const child = await f.student(school, arm._id, { firstName: "Bilal", surName: "Alaka", studentID: "QM/1067" });
    const fee = await f.fee(school, term._id, arm._id, [{ description: "Tuition", amount: 500000 }]);
    return { school, arm, sess, term, child, fee };
}
const record = (w, body, school = w.school) =>
    run(payment.createPayment, {
        ...asSchool(school),
        body: { studentId: String(w.child._id), feeId: String(w.fee._id), amount: 250000, paymentMethod: "bank transfer", paymentDate: "2026-10-16", ...body },
    });
const count = () => M.paymentModel.countDocuments();

describe("amount", () => {
    test.each([
        ["with a thousands comma", "50,000"],
        ["with a currency sign", "₦50000"],
        ["with three decimal places", "1500.505"],
        ["three decimal places as a number", 1500.505],
        ["negative", -5],
        ["not a number", "fifty thousand"],
        ["an exponent", "5e4"],
    ])("refused when %s", async (_label, amount) => {
        const w = await world();
        const r = await record(w, { amount });
        expect(r.status).toBe(400);
        expect(r.body.error).toMatch(/plain number with at most two decimal places/);
        expect(await count()).toBe(0);
    });

    test.each([0, "0", "0.00"])("zero (%p) is refused", async (amount) => {
        const w = await world();
        const r = await record(w, { amount });
        expect(r).toEqual({ status: 400, body: { success: false, error: "Payment amount must be more than zero." } });
        expect(await count()).toBe(0);
    });

    test.each([undefined, null, ""])("missing (%p) is refused", async (amount) => {
        const w = await world();
        expect((await record(w, { amount })).status).toBe(400);
    });

    test.each([
        ["50000", 50000],
        ["1500.50", 1500.5],
        [1500.5, 1500.5],
        [0.01, 0.01],
    ])("%p is recorded as %p", async (amount, stored) => {
        const w = await world();
        const r = await record(w, { amount });
        expect(r.status).toBe(201);
        expect((await M.paymentModel.findOne()).amount).toBe(stored);
    });
});

describe("method", () => {
    test.each([undefined, "", "Cash", "transfer", "pos"])("%p is refused, naming the allowed methods", async (paymentMethod) => {
        const w = await world();
        const r = await record(w, { paymentMethod });
        expect(r.status).toBe(400);
        expect(r.body.error).toBe('Payment method is required: one of "cash", "bank transfer", "card", "other"');
        expect(await count()).toBe(0);
    });

    test.each(["cash", "bank transfer", "card", "other"])("%p is recorded as given", async (paymentMethod) => {
        const w = await world();
        expect((await record(w, { paymentMethod })).status).toBe(201);
        expect((await M.paymentModel.findOne()).paymentMethod).toBe(paymentMethod);
    });
});

describe("duplicate reference", () => {
    const existing = async (w, o = {}) =>
        f.payment(w.school, w.child._id, w.fee._id, { amount: 250000, paymentMethod: "bank transfer", reference: "QM/1067 BILAL ALAKA", paymentDate: f.D("2026-10-16"), ...o });

    test("the same reference, retyped, gets a 409 naming the existing payment, and nothing is saved", async () => {
        const w = await world();
        await existing(w);
        const r = await record(w, { reference: "  qm 1067 bilal-alaka " });
        expect(r.status).toBe(409);
        expect(r.body).toMatchObject({ success: false, code: "DUPLICATE_REFERENCE" });
        expect(r.body.error).toBe(
            "This reference has already been recorded for Bilal Alaka (QM/1067): ₦250,000 on 16 October 2026. If this is a separate payment, send it again with confirmDuplicate: true."
        );
        expect(r.body.duplicates).toHaveLength(1);
        expect(await count()).toBe(1);
    });

    test("confirmDuplicate: true records it", async () => {
        const w = await world();
        await existing(w);
        expect((await record(w, { reference: "QM/1067 BILAL ALAKA", confirmDuplicate: true })).status).toBe(201);
        expect(await count()).toBe(2);
    });

    test.each(["true", 1, "yes"])("confirmDuplicate must be the boolean true, not %p", async (confirmDuplicate) => {
        const w = await world();
        await existing(w);
        expect((await record(w, { reference: "QM/1067 BILAL ALAKA", confirmDuplicate })).status).toBe(409);
        expect(await count()).toBe(1);
    });

    test("school-wide: the same line recorded against another term still warns", async () => {
        const w = await world();
        const lastTerm = await f.term(w.school, w.sess._id, { termName: "Third Term", currentTerm: false });
        const lastFee = await f.fee(w.school, lastTerm._id, w.arm._id, [{ description: "Tuition", amount: 450000 }]);
        await existing(w, { feeId: lastFee._id });
        expect((await record(w, { reference: "QM/1067 BILAL ALAKA" })).status).toBe(409);
    });

    test("another school's identical reference doesn't warn", async () => {
        const w = await world();
        await f.payment(f.id(), f.id(), f.id(), { reference: "QM/1067 BILAL ALAKA" });
        expect((await record(w, { reference: "QM/1067 BILAL ALAKA" })).status).toBe(201);
    });

    test.each(["", "   ", undefined])("a blank reference (%p) is never a duplicate", async (reference) => {
        const w = await world();
        await existing(w, { reference: "" });
        expect((await record(w, { reference })).status).toBe(201);
    });

    test("a cut-short narration isn't 'the same reference' (the search finds it; recording isn't blocked)", async () => {
        const w = await world();
        await existing(w);
        expect((await record(w, { reference: "QM/1067 BILAL" })).status).toBe(201);
    });
});
