// The school's fee figures: GET /fee/roster (one term, many students) and
// GET /fee/statement/:studentId (one student, the parent's shape).
//
// The roster exists only because a statement per student would be a
// round of queries per child. It must never be a second opinion: every
// row is checked here against buildFeeStatement for the same student and
// fee, field by field, across every status. If the two ever disagree, the
// school and the family are looking at different balances.
const M = require("../models");
const fee = require("../controller/fee");
const payment = require("../controller/payment");
const portal = require("../controller/portal");
const { buildFeeStatement, buildFeeRoster } = require("../utils/buildFeeStatement");
const { resolveReferenceTerm } = require("../utils/referenceTerm");
const { useTestDatabase } = require("./helpers/db");
const { run, asSchool, asParent } = require("./helpers/http");
const { recordQueries, unscopedQueries } = require("./helpers/queryLog");
const f = require("./helpers/factories");

useTestDatabase();

const FIGURES = ["feeId", "currency", "complete", "payable", "paid", "outstanding", "overpaid", "status"];
const figures = (x) => Object.fromEntries(FIGURES.map((k) => [k, x[k]]));

// A fee with an amount the model would refuse, as an old record could hold
const rawFee = async (school, termId, armId, fees) => {
    const _id = f.id();
    await M.feeModel.collection.insertOne({ _id, schoolId: school, termId, classArmId: armId, currency: "NGN", fees });
    return { _id };
};

// One school, two terms, every status:
//   last term (ended): JSS1 A ₦10,000 — Kemi paid it, then was promoted
//   this term (current):
//     JSS1 A ₦25.56 in awkward decimals — Ada part-paid, Bola paid,
//            Chidi overpaid, Dayo nothing
//     JSS1 B ₦0                           — Efe: nothing due
//     JSS2 A an amount that can't be read — Kemi (promoted here)
//     JSS3 A no fee set                   — Funmi
async function school() {
    const s = f.id();
    const sess = await f.session(s);
    const last = await f.term(s, sess._id, { termName: "Third Term", currentTerm: false, termStartDate: f.D("2026-04-20"), termEndDate: f.D("2026-07-24") });
    const now = await f.term(s, sess._id, { termName: "First Term" });
    const jss1a = await f.classArm(s, "JSS1", "a");
    const jss1b = await M.classArmModel.create({ schoolId: s, classLevelId: jss1a.classLevelId, armName: "b" });
    const jss2a = await f.classArm(s, "JSS2", "a");
    const jss3a = await f.classArm(s, "JSS3", "a");

    const kids = {};
    for (const [name, arm] of [["Ada", jss1a], ["Bola", jss1a], ["Chidi", jss1a], ["Dayo", jss1a], ["Efe", jss1b], ["Kemi", jss2a], ["Funmi", jss3a]]) {
        kids[name] = await f.student(s, arm._id, { firstName: name });
    }

    const lastFee = await f.fee(s, last._id, jss1a._id, [{ description: "Tuition", amount: 10000 }]);
    await f.payment(s, kids.Kemi._id, lastFee._id, { amount: 10000 });

    const fee1a = await f.fee(s, now._id, jss1a._id, [
        { description: "A", amount: 1.15 }, { description: "B", amount: 0.07 }, { description: "C", amount: 19.99 }, { description: "D", amount: 4.35 },
    ]);
    // As floats these sum to 4.6499999999999995; in kobo, 4.65
    for (const amount of [0.1, 0.2, 4.35]) await f.payment(s, kids.Ada._id, fee1a._id, { amount });
    await f.payment(s, kids.Bola._id, fee1a._id, { amount: 25.56 });
    await f.payment(s, kids.Chidi._id, fee1a._id, { amount: 30 });
    await f.fee(s, now._id, jss1b._id, [{ description: "Bursary", amount: 0 }]);
    await rawFee(s, now._id, jss2a._id, [{ description: "Tuition", amount: "50,000" }]);

    return { s, sess, last, now, jss1a, jss1b, jss2a, jss3a, kids, lastFee, fee1a };
}

const roster = (w, query = {}) => run(fee.getFeeRoster, { ...asSchool(w.s), query });
const statementOf = (w, kid) => buildFeeStatement(w.s, kid._id, kid.classArmId);

describe("the roster and the statement agree", () => {
    test("this term: every student's row is their statement's current fee, field for field", async () => {
        const w = await school();
        const { body } = await roster(w, { termId: String(w.now._id) });
        const statuses = new Set();
        for (const kid of Object.values(w.kids)) {
            const rows = body.data.rows.filter((r) => r.studentId === String(kid._id) && r.inClass);
            expect(rows).toHaveLength(1);
            const { current } = await statementOf(w, kid);
            if (current === null) {
                expect(rows[0].status).toBe("no_fee");
            } else {
                expect({ who: kid.firstName, ...figures(rows[0]) }).toEqual({ who: kid.firstName, ...figures(current) });
            }
            statuses.add(rows[0].status);
        }
        // The fixture really does cover every status
        expect([...statuses].sort()).toEqual(["no_fee", "nothing_due", "paid", "part_paid", "unknown", "unpaid"]);
    });

    // Nothing records which class a child was in last term, so a statement
    // can only show a past fee the child paid against. The roster lists the
    // class's current members too — but with no payment, it claims no
    // balance ("no_record"), so it never shows a debt the statement doesn't.
    test("a past term: every row with figures is the matching line of that student's statement, and every line has a row", async () => {
        const w = await school();
        const { body } = await roster(w, { termId: String(w.last._id) });
        const termRows = body.data.rows.filter((r) => r.feeId);
        for (const kid of Object.values(w.kids)) {
            const st = await statementOf(w, kid);
            const lines = [st.current, ...st.otherFees].filter((l) => l && l.term.termId === String(w.last._id));
            const rows = termRows.filter((r) => r.studentId === String(kid._id));
            expect({ who: kid.firstName, rows: rows.filter((r) => r.status !== "no_record").map(figures) })
                .toEqual({ who: kid.firstName, rows: lines.map(figures) });
            for (const r of rows.filter((x) => x.status === "no_record")) {
                expect(r).toMatchObject({ paid: 0, payable: null, outstanding: null, overpaid: null });
            }
        }
        expect(termRows.filter((r) => r.status !== "no_record").map((r) => [r.name.split(" ")[0], r.status])).toEqual([["Kemi", "paid"]]);
    });

    test("a term not yet started: its figures are what each statement shows once it's the current term", async () => {
        const w = await school();
        // Far ahead, so this stays a term that hasn't ended whenever the suite runs
        const next = await f.term(w.s, w.sess._id, { termName: "Second Term", currentTerm: false, termStartDate: f.D("2099-01-05"), termEndDate: f.D("2099-04-03") });
        const nextFee = await f.fee(w.s, next._id, w.jss1a._id, [{ description: "Tuition", amount: 30000 }]);
        await f.payment(w.s, w.kids.Bola._id, nextFee._id, { amount: 12000 }); // paying ahead
        const { body } = await roster(w, { termId: String(next._id) });

        await M.termModel.updateMany({ schoolId: w.s }, { currentTerm: false });
        await M.termModel.updateOne({ _id: next._id }, { currentTerm: true });
        for (const kid of Object.values(w.kids)) {
            const row = body.data.rows.find((r) => r.studentId === String(kid._id) && r.inClass);
            const { current } = await statementOf(w, kid);
            if (current === null) expect(row.status).toBe("no_fee");
            else expect({ who: kid.firstName, ...figures(row) }).toEqual({ who: kid.firstName, ...figures(current) });
        }
        expect(body.data.rows.find((r) => r.studentId === String(w.kids.Bola._id))).toMatchObject({ status: "part_paid", outstanding: 18000 });
    });

    test("the same kobo arithmetic: awkward decimals sum exactly in both", async () => {
        const w = await school();
        const { body } = await roster(w, { termId: String(w.now._id) });
        const ada = body.data.rows.find((r) => r.studentId === String(w.kids.Ada._id));
        expect(ada).toMatchObject({ payable: 25.56, paid: 4.65, outstanding: 20.91, overpaid: 0, status: "part_paid" });
        const chidi = body.data.rows.find((r) => r.studentId === String(w.kids.Chidi._id));
        expect(chidi).toMatchObject({ outstanding: 0, overpaid: 4.44, status: "paid" });
    });
});

describe("who a class lists", () => {
    test("for a past term: everyone in it now, plus anyone who paid its fee and has moved — labelled with where they are now", async () => {
        const w = await school();
        const { body } = await roster(w, { termId: String(w.last._id), classLevelId: String(w.jss1a.classLevelId) });
        const jss1a = body.data.rows.filter((r) => r.classArmId === String(w.jss1a._id));
        expect(jss1a.map((r) => [r.name.split(" ")[0], r.inClass, r.nowIn])).toEqual([
            // In the class now (no payment needed to be listed)…
            ["Ada", true, null], ["Bola", true, null], ["Chidi", true, null], ["Dayo", true, null],
            // …then those who paid and moved
            ["Kemi", false, "JSS2 A"],
        ]);
        // In the class now, but no payment: no balance claimed for a term they may not have been in
        expect(jss1a.find((r) => r.inClass && r.name.startsWith("Ada"))).toMatchObject({ status: "no_record", paid: 0, outstanding: null });
        expect(jss1a.find((r) => !r.inClass)).toMatchObject({ status: "paid", paid: 10000, outstanding: 0 });
    });

    test("a level's roster has only that level's classes", async () => {
        const w = await school();
        const { body } = await roster(w, { termId: String(w.now._id), classLevelId: String(w.jss1a.classLevelId) });
        expect([...new Set(body.data.rows.map((r) => r.classLabel))]).toEqual(["JSS1 A", "JSS1 B"]);
        expect(body.data.classes.map((c) => c.classLabel)).toEqual(["JSS1 A", "JSS1 B"]);
    });
});

describe("counts", () => {
    test("by status, per class and in total; nothing due and unreadable each counted on their own", async () => {
        const w = await school();
        const { body } = await roster(w, { termId: String(w.now._id) });
        expect(body.data.counts).toEqual({ students: 7, unpaid: 1, part_paid: 1, paid: 2, nothing_due: 1, unknown: 1, no_fee: 1, no_record: 0 });
        const byClass = Object.fromEntries(body.data.classes.map((c) => [c.classLabel, [c.hasFee, c.counts.students]]));
        expect(byClass).toEqual({ "JSS1 A": [true, 4], "JSS1 B": [true, 1], "JSS2 A": [true, 1], "JSS3 A": [false, 1] });
    });

    test("a student who moved is counted once — in the class they're in now", async () => {
        const w = await school();
        const { body } = await roster(w, { termId: String(w.last._id) });
        expect(body.data.rows.filter((r) => r.studentId === String(w.kids.Kemi._id))).toHaveLength(2);
        expect(body.data.counts.students).toBe(7);
        const jss1a = body.data.classes.find((c) => c.classLabel === "JSS1 A");
        expect(jss1a.counts).toMatchObject({ students: 4, no_record: 4, unpaid: 0, paid: 0 });
    });
});

describe("deactivated students", () => {
    async function withLeaver() {
        const w = await school();
        await M.studentModel.updateOne({ _id: w.kids.Dayo._id }, { status: "deactivated" }); // unpaid
        await M.studentModel.updateOne({ _id: w.kids.Bola._id }, { status: "deactivated" }); // paid
        return w;
    }

    test("aren't counted, whatever they owe or have paid, in total or per class", async () => {
        const w = await withLeaver();
        const { body } = await roster(w, { termId: String(w.now._id) });
        expect(body.data.counts).toEqual({ students: 5, unpaid: 0, part_paid: 1, paid: 1, nothing_due: 1, unknown: 1, no_fee: 1, no_record: 0 });
        expect(body.data.classes.find((c) => c.classLabel === "JSS1 A").counts).toMatchObject({ students: 2, unpaid: 0, part_paid: 1, paid: 1 });
    });

    test("stay in the rows, labelled, with the same figures as their statement", async () => {
        const w = await withLeaver();
        const { body } = await roster(w, { termId: String(w.now._id) });
        const bola = body.data.rows.find((r) => r.studentId === String(w.kids.Bola._id));
        expect(bola).toMatchObject({ studentStatus: "deactivated", inClass: true, status: "paid" });
        const st = await buildFeeStatement(w.s, w.kids.Bola._id, w.jss1a._id);
        expect(figures(bola)).toEqual(figures(st.current));
        expect(body.data.rows.filter((r) => r.studentStatus === "deactivated")).toHaveLength(2);
    });

    test("a level's roster leaves them out of its counts too", async () => {
        const w = await withLeaver();
        const { body } = await roster(w, { termId: String(w.now._id), classLevelId: String(w.jss1a.classLevelId) });
        expect(body.data.counts.students).toBe(3);
        expect(body.data.rows.filter((r) => r.classLabel === "JSS1 A" && r.inClass)).toHaveLength(4);
    });

    test("a student with no status on record (an old document) still counts", async () => {
        const w = await school();
        await M.studentModel.collection.updateOne({ _id: w.kids.Dayo._id }, { $unset: { status: "" } });
        const { body } = await roster(w, { termId: String(w.now._id) });
        expect(body.data.counts.students).toBe(7);
    });
});

describe("which term", () => {
    test("asked for none: the active term, and the answer names it", async () => {
        const w = await school();
        const { status, body } = await roster(w);
        expect(status).toBe(200);
        expect(body.data.term).toEqual({ termId: String(w.now._id), termName: "First Term", sessionName: "2026/2027", chosenBy: "active" });
    });

    test("asked for one: that one, said to be requested", async () => {
        const w = await school();
        const { body } = await roster(w, { termId: String(w.last._id) });
        expect(body.data.term).toMatchObject({ termId: String(w.last._id), termName: "Third Term", chosenBy: "requested" });
    });

    test("with no active term: today's, else the next, else the last", async () => {
        const s = f.id();
        const sess = await f.session(s);
        const t = (name, start, end) => f.term(s, sess._id, { termName: name, currentTerm: false, termStartDate: f.D(start), termEndDate: f.D(end) });
        await t("First", "2026-01-05", "2026-04-03");
        await t("Second", "2026-04-20", "2026-07-24");
        await t("Third", "2026-09-14", "2026-12-11");
        await M.termModel.create({ schoolId: s, sessionId: sess._id, termName: "Undated", currentTerm: false });
        const pick = async (day) => {
            const r = await resolveReferenceTerm(s, new Date(`${day}T15:00:00.000Z`));
            return r && [r.term.termName, r.chosenBy];
        };
        expect(await pick("2026-05-01")).toEqual(["Second", "today"]);
        // Both ends of a term count as in it
        expect(await pick("2026-04-20")).toEqual(["Second", "today"]);
        expect(await pick("2026-07-24")).toEqual(["Second", "today"]);
        expect(await pick("2026-08-01")).toEqual(["Third", "next"]);
        expect(await pick("2025-12-01")).toEqual(["First", "next"]);
        expect(await pick("2027-01-10")).toEqual(["Third", "last"]);
    });

    test("an active term wins over the dates", async () => {
        const s = f.id();
        const sess = await f.session(s);
        await f.term(s, sess._id, { termName: "By dates", currentTerm: false, termStartDate: f.D("2026-09-14"), termEndDate: f.D("2026-12-11") });
        await f.term(s, sess._id, { termName: "Marked active", currentTerm: true, termStartDate: f.D("2027-01-04"), termEndDate: f.D("2027-04-02") });
        const r = await resolveReferenceTerm(s, new Date("2026-10-31T12:00:00.000Z"));
        expect([r.term.termName, r.chosenBy]).toEqual(["Marked active", "active"]);
    });

    test("a school with no terms gets an empty roster, not an error", async () => {
        const s = f.id();
        await f.classArm(s);
        expect(await run(fee.getFeeRoster, { ...asSchool(s), query: {} })).toEqual({
            status: 200, body: { success: true, message: null, data: { term: null, rows: [], counts: null, classes: [] } },
        });
    });
});

describe("scoped to the school", () => {
    test("another school's term or class level is not found; a malformed id is refused", async () => {
        const w = await school();
        const other = await school();
        expect((await roster(w, { termId: String(other.now._id) })).status).toBe(404);
        expect((await roster(w, { classLevelId: String(other.jss1a.classLevelId) })).status).toBe(404);
        expect((await roster(w, { termId: "nope" })).status).toBe(400);
    });

    test("every query the roster makes is filtered by the school", async () => {
        const w = await school();
        await school(); // another school's data in the same database
        const models = [M.termModel, M.sessionModel, M.classArmModel, M.classLevelModel, M.feeModel, M.paymentModel, M.studentModel];
        const calls = await recordQueries(models, () => roster(w));
        expect(calls.length).toBeGreaterThan(0);
        expect(unscopedQueries(calls, w.s)).toEqual([]);
        const direct = await recordQueries(models, () => buildFeeRoster(w.s, w.now._id));
        expect(unscopedQueries(direct, w.s)).toEqual([]);
    });

    test("another school's students and payments never appear", async () => {
        const w = await school();
        const other = await school();
        // A payment in the other school against this school's fee id
        await f.payment(other.s, other.kids.Ada._id, w.fee1a._id, { amount: 25.56 });
        const { body } = await roster(w, { termId: String(w.now._id) });
        const otherIds = new Set(Object.values(other.kids).map((k) => String(k._id)));
        expect(body.data.rows.some((r) => otherIds.has(r.studentId))).toBe(false);
        expect(body.data.rows.find((r) => r.studentId === String(w.kids.Dayo._id))).toMatchObject({ paid: 0, status: "unpaid" });
    });
});

// A payment is a (student, fee) pair; the class is no part of it. Dayo is
// promoted to JSS2 A, then pays last term's JSS1 A fee.
describe("a late payment for a class the student has left", () => {
    const guardianOf = async (school, kid) => {
        const _id = f.id();
        await M.studentModel.updateOne({ _id: kid._id, schoolId: school }, { $push: { guardians: { parentId: _id, relationship: "Mother" } } });
        return { _id };
    };
    async function promoted() {
        const w = await school();
        await M.studentModel.updateOne({ _id: w.kids.Dayo._id }, { classArmId: w.jss2a._id });
        const dayo = await M.studentModel.findById(w.kids.Dayo._id);
        const r = await run(payment.createPayment, {
            ...asSchool(w.s),
            body: { studentId: String(dayo._id), feeId: String(w.lastFee._id), amount: 4000, paymentMethod: "cash", paymentDate: "2026-10-16" },
        });
        expect(r.status).toBe(201);
        return { w, dayo };
    }

    test("is on the parent's statement, under the class and term it was for", async () => {
        const { w, dayo } = await promoted();
        const parent = await guardianOf(w.s, dayo);
        const { status, body } = await run(portal.getChildFees, { ...asParent(parent._id, w.s), params: { childId: String(dayo._id) } });
        expect(status).toBe(200);
        expect(body.data.otherFees).toHaveLength(1);
        expect(body.data.otherFees[0]).toMatchObject({
            feeId: String(w.lastFee._id), classLabel: "JSS1 A", term: { termName: "Third Term", sessionName: "2026/2027" },
            payable: 10000, paid: 4000, outstanding: 6000, status: "part_paid",
        });
        // This term's fee is for the class they're in now, and untouched by it
        expect(body.data.current.classLabel).toBe("JSS2 A");
        expect(body.data.current.paid).toBe(0);
    });

    test("is on the roster for that term, labelled with where they are now, matching the statement", async () => {
        const { w, dayo } = await promoted();
        const { body } = await roster(w, { termId: String(w.last._id) });
        const row = body.data.rows.find((r) => r.studentId === String(dayo._id));
        expect(row).toMatchObject({ classLabel: "JSS1 A", inClass: false, nowIn: "JSS2 A", paid: 4000, outstanding: 6000, status: "part_paid" });
        const st = await statementOf(w, dayo);
        expect(figures(row)).toEqual(figures(st.otherFees[0]));
    });

    test("leaves this term's roster row for the class they're in now alone", async () => {
        const { w, dayo } = await promoted();
        const { body } = await roster(w, { termId: String(w.now._id) });
        const rows = body.data.rows.filter((r) => r.studentId === String(dayo._id));
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ classLabel: "JSS2 A", inClass: true, status: "unknown", paid: 0 });
    });
});

describe("GET /fee/choices/:studentId", () => {
    const choicesFor = (w, kid) => run(fee.getFeeChoices, { ...asSchool(w.s), params: { studentId: String(kid._id) } });

    test("every fee in the school, each naming its class, term and session", async () => {
        const w = await school();
        const { status, body } = await choicesFor(w, w.kids.Kemi);
        expect(status).toBe(200);
        expect(body.data.map((c) => [c.classLabel, c.term.termName, c.term.sessionName])).toEqual([
            // Newest term first; within it, the student's own class first
            ["JSS2 A", "First Term", "2026/2027"],
            ["JSS1 A", "First Term", "2026/2027"],
            ["JSS1 B", "First Term", "2026/2027"],
            ["JSS1 A", "Third Term", "2026/2027"],
        ]);
        expect(body.data.map((c) => c.isCurrentClass)).toEqual([true, false, false, false]);
    });

    test("the amount and what this student has paid: the same figures as their statement", async () => {
        const w = await school();
        const { body } = await choicesFor(w, w.kids.Kemi);
        const st = await statementOf(w, w.kids.Kemi);
        const chosen = body.data.find((c) => c.feeId === String(w.lastFee._id));
        expect(chosen).toMatchObject({ payable: 10000, paid: 10000, complete: true, currency: "NGN" });
        expect([chosen.payable, chosen.paid]).toEqual([st.otherFees[0].payable, st.otherFees[0].paid]);
        // Only this student's payments count
        const ada = (await choicesFor(w, w.kids.Ada)).body.data.find((c) => c.feeId === String(w.fee1a._id));
        expect(ada.paid).toBe(4.65);
        // An amount it can't read: no total, said to be incomplete
        expect(body.data.find((c) => c.classLabel === "JSS2 A")).toMatchObject({ complete: false, payable: null });
    });

    test("claims no balance: most of these aren't debts anyone can show this student owes", async () => {
        const w = await school();
        const { body } = await choicesFor(w, w.kids.Funmi);
        for (const c of body.data) {
            expect(c).not.toHaveProperty("outstanding");
            expect(c).not.toHaveProperty("status");
        }
    });

    test("scoped: another school's student isn't found, another school's fees aren't offered, every query is filtered", async () => {
        const w = await school();
        const other = await school();
        expect((await choicesFor(w, other.kids.Ada)).status).toBe(404);
        expect((await run(fee.getFeeChoices, { ...asSchool(w.s), params: { studentId: "nope" } })).status).toBe(400);
        const { body } = await choicesFor(w, w.kids.Ada);
        const otherFees = (await M.feeModel.find({ schoolId: other.s })).map((x) => String(x._id));
        expect(body.data.some((c) => otherFees.includes(c.feeId))).toBe(false);
        const models = [M.termModel, M.sessionModel, M.classArmModel, M.classLevelModel, M.feeModel, M.paymentModel, M.studentModel];
        const calls = await recordQueries(models, () => choicesFor(w, w.kids.Ada));
        expect(unscopedQueries(calls, w.s)).toEqual([]);
    });
});

describe("GET /fee/statement/:studentId", () => {
    test("is the student's statement — what their parent sees", async () => {
        const w = await school();
        const { status, body } = await run(fee.getStudentFeeStatement, { ...asSchool(w.s), params: { studentId: String(w.kids.Kemi._id) } });
        expect(status).toBe(200);
        const json = (x) => JSON.parse(JSON.stringify(x));
        expect(json(body.data)).toEqual(json(await statementOf(w, w.kids.Kemi)));
        // Promoted: this term's fee is JSS2's; last term's JSS1 fee is still on it
        expect(body.data.current.classLabel).toBe("JSS2 A");
        expect(body.data.otherFees.map((l) => [l.classLabel, l.status])).toEqual([["JSS1 A", "paid"]]);
    });

    test("another school's student is not found; a malformed id is refused", async () => {
        const w = await school();
        const other = await school();
        expect((await run(fee.getStudentFeeStatement, { ...asSchool(w.s), params: { studentId: String(other.kids.Ada._id) } })).status).toBe(404);
        expect((await run(fee.getStudentFeeStatement, { ...asSchool(w.s), params: { studentId: "nope" } })).status).toBe(400);
    });
});
