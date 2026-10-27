// buildFeeStatement is the one place fee lists and payments become
// payable / paid / outstanding. Families and the bursar both read it, so
// its arithmetic is the school's arithmetic.
//
// - Sums are done in kobo, so decimal amounts never drift.
// - A fee with any amount it can't read is complete:false — status
//   "unknown", no payable/outstanding — rather than a guessed balance.
// - Everything is scoped to one school.
const M = require("../models");
const { buildFeeStatement } = require("../utils/buildFeeStatement");
const { useTestDatabase } = require("./helpers/db");
const f = require("./helpers/factories");

useTestDatabase();

async function world() {
    const school = f.id();
    const arm = await f.classArm(school, "JSS1", "b");
    const sess = await f.session(school);
    const term = await f.term(school, sess._id);
    const child = await f.student(school, arm._id);
    return { school, arm, sess, term, child };
}
const statement = (w) => buildFeeStatement(w.school, w.child._id, w.arm._id);

// Writes a fee straight to the collection — the way an old record, or one
// written around the API, could hold an amount the model would refuse
const rawFee = async (w, fees) => {
    const _id = f.id();
    await M.feeModel.collection.insertOne({ _id, schoolId: w.school, termId: w.term._id, classArmId: w.arm._id, currency: "NGN", fees });
    return _id;
};

describe("arithmetic", () => {
    test("payable, paid and outstanding for a part-paid fee", async () => {
        const w = await world();
        const fee = await f.fee(w.school, w.term._id, w.arm._id, [{ description: "Tuition", amount: 500000 }, { description: "Platform fee", amount: 2000 }]);
        await f.payment(w.school, w.child._id, fee._id, { amount: 100000 });
        await f.payment(w.school, w.child._id, fee._id, { amount: 50000.5 });

        const { current } = await statement(w);
        expect(current).toMatchObject({ complete: true, payable: 502000, paid: 150000.5, outstanding: 351999.5, overpaid: 0, status: "part_paid" });
    });

    test("decimal amounts sum exactly, in kobo (0.10 + 0.20 is 0.30, not 0.30000000000000004)", async () => {
        const w = await world();
        const fee = await f.fee(w.school, w.term._id, w.arm._id, [{ description: "A", amount: 0.1 }, { description: "B", amount: 0.2 }]);
        await f.payment(w.school, w.child._id, fee._id, { amount: 0.1 });
        await f.payment(w.school, w.child._id, fee._id, { amount: 0.2 });

        const { current } = await statement(w);
        expect(current.payable).toBe(0.3);
        expect(current.paid).toBe(0.3);
        expect(current.outstanding).toBe(0);
        expect(current.status).toBe("paid");
    });

    test("amounts that don't scale exactly (1.15 × 100 is 114.99999999999999) still sum to the kobo", async () => {
        const w = await world();
        const fee = await f.fee(w.school, w.term._id, w.arm._id, [
            { description: "A", amount: 1.15 }, { description: "B", amount: 0.07 }, { description: "C", amount: 19.99 }, { description: "D", amount: 4.35 },
        ]);
        await f.payment(w.school, w.child._id, fee._id, { amount: 1.15 });
        await f.payment(w.school, w.child._id, fee._id, { amount: 0.07 });
        await f.payment(w.school, w.child._id, fee._id, { amount: 4.35 });

        const { current } = await statement(w);
        expect(current.payable).toBe(25.56);
        expect(current.paid).toBe(5.57);
        expect(current.outstanding).toBe(19.99);
    });

    test("overpaid: outstanding is 0 and the excess is its own figure, never a negative balance", async () => {
        const w = await world();
        const fee = await f.fee(w.school, w.term._id, w.arm._id, [{ description: "Tuition", amount: 1000 }]);
        await f.payment(w.school, w.child._id, fee._id, { amount: 1000.2 });

        const { current } = await statement(w);
        expect(current).toMatchObject({ payable: 1000, paid: 1000.2, outstanding: 0, overpaid: 0.2, status: "paid" });
    });

    test.each([
        ["unpaid", [], "unpaid"],
        ["paid exactly", [502000], "paid"],
        ["nothing due (all items zero)", [], "nothing_due", [{ description: "Uniform (waived)", amount: 0 }]],
    ])("status: %s", async (_label, amounts, status, items = [{ description: "Tuition", amount: 500000 }, { description: "Platform fee", amount: 2000 }]) => {
        const w = await world();
        const fee = await f.fee(w.school, w.term._id, w.arm._id, items);
        for (const amount of amounts) await f.payment(w.school, w.child._id, fee._id, { amount });
        expect((await statement(w)).current.status).toBe(status);
    });
});

describe("complete:false — an amount it can't read is never guessed at", () => {
    test.each([
        ["a string with a comma", "50,000"],
        ["a negative number", -500],
        ["more than two decimal places", 10.505],
        ["missing", undefined],
    ])("%s", async (_label, badAmount) => {
        const w = await world();
        const feeId = await rawFee(w, [{ description: "Tuition", amount: 500000 }, { description: "PTA levy", amount: badAmount }]);
        await f.payment(w.school, w.child._id, feeId, { amount: 100000 });

        const { current } = await statement(w);
        expect(current).toMatchObject({ complete: false, status: "unknown", payable: null, outstanding: null, overpaid: null });
        // What was paid is still a fact, and the readable item keeps its amount
        expect(current.paid).toBe(100000);
        expect(current.items).toEqual([{ description: "Tuition", amount: 500000 }, { description: "PTA levy", amount: null }]);
    });
});

describe("what's in the statement", () => {
    test("another school's payment for the same student id is not counted", async () => {
        const w = await world();
        const fee = await f.fee(w.school, w.term._id, w.arm._id, [{ description: "Tuition", amount: 1000 }]);
        await f.payment(w.school, w.child._id, fee._id, { amount: 400 });
        await f.payment(f.id(), w.child._id, fee._id, { amount: 600 });

        const { current } = await statement(w);
        expect(current.paid).toBe(400);
        expect(current.status).toBe("part_paid");
    });

    test("an earlier term's fee keeps the class it was set for, not the child's current class", async () => {
        const w = await world();
        const lastArm = await f.classArm(w.school, "JSS1", "a");
        const lastTerm = await f.term(w.school, w.sess._id, { termName: "Third Term", currentTerm: false, termStartDate: f.D("2026-04-20") });
        const oldFee = await f.fee(w.school, lastTerm._id, lastArm._id, [{ description: "Tuition", amount: 450000 }]);
        await f.payment(w.school, w.child._id, oldFee._id, { amount: 450000 });
        await f.fee(w.school, w.term._id, w.arm._id, [{ description: "Tuition", amount: 500000 }]);

        const s = await statement(w);
        expect(s.current.classLabel).toBe("JSS1 B");
        expect(s.otherFees).toHaveLength(1);
        expect(s.otherFees[0]).toMatchObject({ classLabel: "JSS1 A", status: "paid", term: { termName: "Third Term" } });
    });

    test("a payment against a deleted fee is listed as unallocated, not lost or counted", async () => {
        const w = await world();
        await f.payment(w.school, w.child._id, f.id(), { amount: 7000, reference: "RCPT-77" });
        const s = await statement(w);
        expect(s.current).toBeNull();
        expect(s.unallocatedPayments).toEqual([expect.objectContaining({ amount: 7000, reference: "RCPT-77" })]);
    });

    test("payments show date, amount, method and reference only — no internal note or who received it", async () => {
        const w = await world();
        const fee = await f.fee(w.school, w.term._id, w.arm._id, [{ description: "Tuition", amount: 1000 }]);
        await f.payment(w.school, w.child._id, fee._id, { amount: 500, note: "parent was rude", receivedBy: "Mr Bursar" });
        const [p] = (await statement(w)).current.payments;
        expect(Object.keys(p).sort()).toEqual(["_id", "amount", "date", "method", "reference"]);
    });
});
