// "A closed day that has started can't be reopened."
//
// No register is asked for on a closed day, and one can't be taken after
// the fact: reopening today would get every student auto-marked absent at
// closing time, and reopening past days would put days with no register
// into every child's attendance. findReopenedDays (utils/schoolDay.js) is
// the one place that rule lives; editing, moving and deleting a calendar
// entry all go through it.
const M = require("../models");
const { findReopenedDays } = require("../utils/schoolDay");
const calendar = require("../controller/schoolCalendar");
const { useTestDatabase } = require("./helpers/db");
const { run, asSchool } = require("./helpers/http");
const f = require("./helpers/factories");

useTestDatabase();

const entry = (schoolId, start, end, closesSchool = true, o = {}) =>
    M.schoolCalendarModel.create({ schoolId, name: "Closure", type: "school_break", startDate: f.D(start), endDate: f.D(end), closesSchool, ...o });
const days = (ds) => ds.map((d) => d.toISOString().slice(0, 10));

describe("the rule, at a fixed 'now': Wednesday 21 October 2026, mid-afternoon", () => {
    const NOW = new Date("2026-10-21T15:00:00Z");

    test("deleting reopens the started weekdays only — not the weekend, not the days still to come", async () => {
        const school = f.id();
        const e = await entry(school, "2026-10-16", "2026-10-27");
        expect(days(await findReopenedDays(school, e, null, NOW))).toEqual(["2026-10-16", "2026-10-19", "2026-10-20", "2026-10-21"]);
    });

    test("ending a closure yesterday reopens today", async () => {
        const school = f.id();
        const e = await entry(school, "2026-10-19", "2026-10-30");
        expect(days(await findReopenedDays(school, e, { startDate: "2026-10-19", endDate: "2026-10-20", closesSchool: true }, NOW))).toEqual(["2026-10-21"]);
    });

    test("moving a started closure off its days reopens them", async () => {
        const school = f.id();
        const e = await entry(school, "2026-10-19", "2026-10-20");
        expect(days(await findReopenedDays(school, e, { startDate: "2026-11-02", endDate: "2026-11-03", closesSchool: true }, NOW))).toEqual(["2026-10-19", "2026-10-20"]);
    });

    test("changing it to open reopens its started days", async () => {
        const school = f.id();
        const e = await entry(school, "2026-10-20", "2026-10-22");
        expect(days(await findReopenedDays(school, e, { startDate: "2026-10-20", endDate: "2026-10-22", closesSchool: false }, NOW))).toEqual(["2026-10-20", "2026-10-21"]);
    });

    test.each([
        ["an entry that doesn't close the school", ["2026-10-16", "2026-10-16", false], null],
        ["a closure that hasn't started", ["2026-10-22", "2026-10-30", true], null],
        ["a past closure on a weekend only", ["2026-10-17", "2026-10-18", true], null],
        ["extending a started closure", ["2026-10-19", "2026-10-21", true], { startDate: "2026-10-19", endDate: "2026-10-30", closesSchool: true }],
        ["cutting days still to come off an in-progress closure", ["2026-10-19", "2026-10-30", true], { startDate: "2026-10-19", endDate: "2026-10-21", closesSchool: true }],
    ])("reopens nothing: %s", async (_label, [s, e, closes], next) => {
        const school = f.id();
        const doc = await entry(school, s, e, closes);
        expect(await findReopenedDays(school, doc, next, NOW)).toEqual([]);
    });

    test("an entry stored without closesSchool counts as closed", async () => {
        const school = f.id();
        const _id = f.id();
        await M.schoolCalendarModel.collection.insertOne({ _id, schoolId: school, name: "Old", type: "school_event", startDate: f.D("2026-10-19"), endDate: f.D("2026-10-19") });
        const doc = await M.schoolCalendarModel.findById(_id).lean();
        expect(days(await findReopenedDays(school, doc, null, NOW))).toEqual(["2026-10-19"]);
    });

    test("a day another closing entry still covers isn't reopened — a duplicate can be removed", async () => {
        const school = f.id();
        await entry(school, "2026-10-12", "2026-10-23");
        const dup = await entry(school, "2026-10-19", "2026-10-21");
        expect(await findReopenedDays(school, dup, null, NOW)).toEqual([]);
    });

    test("an open entry on the same day, or a closure in another school, doesn't count as cover", async () => {
        const school = f.id();
        await entry(school, "2026-10-19", "2026-10-19", false);
        await entry(f.id(), "2026-10-19", "2026-10-19", true);
        const doc = await entry(school, "2026-10-19", "2026-10-19");
        expect(days(await findReopenedDays(school, doc, null, NOW))).toEqual(["2026-10-19"]);
    });
});

describe("the calendar endpoints enforce it", () => {
    // Dates relative to the real today: the controllers use the clock
    const n = new Date();
    const today = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
    const at = (offset) => new Date(today + offset * 86400000).toISOString().slice(0, 10);
    const isWeekend = (offset) => [0, 6].includes(new Date(today + offset * 86400000).getUTCDay());
    // The k-th weekday before today
    const pastWeekday = (k) => { let o = 0; while (k > 0) { o -= 1; if (!isWeekend(o)) k -= 1; } return o; };
    const p1 = pastWeekday(1), p3 = pastWeekday(3);

    const update = (school, e, body) =>
        run(calendar.updateCalendarEntry, { ...asSchool(school), params: { id: String(e._id) }, body: { name: "Closure", type: "school_break", ...body } });
    const remove = (school, e) => run(calendar.deleteCalendarEntry, { ...asSchool(school), params: { id: String(e._id) } });
    const stored = (e) => M.schoolCalendarModel.findById(e._id).lean();

    test("changing a past closure to open: 400, explained, nothing saved", async () => {
        const school = f.id();
        const e = await entry(school, at(p3), at(p3));
        const r = await update(school, e, { startDate: at(p3), endDate: at(p3), closesSchool: false });
        expect(r.status).toBe(400);
        expect(r.body.error).toMatch(/^You can't change it like this: it would reopen /);
        expect(r.body.error).toContain("record absences for a register that was never taken");
        expect(r.body.error).toContain("contact support");
        expect((await stored(e)).closesSchool).toBe(true);
    });

    test("moving a past closure into the future: 400, dates unchanged", async () => {
        const school = f.id();
        const e = await entry(school, at(p3), at(p1));
        const r = await update(school, e, { startDate: at(10), endDate: at(12), closesSchool: true });
        expect(r.status).toBe(400);
        expect((await stored(e)).startDate.toISOString().slice(0, 10)).toBe(at(p3));
    });

    test("deleting a past closure: 400, still there", async () => {
        const school = f.id();
        const e = await entry(school, at(p3), at(p1));
        const r = await remove(school, e);
        expect(r.status).toBe(400);
        expect(r.body.error).toMatch(/^You can't remove it: it would reopen /);
        expect(await stored(e)).not.toBeNull();
    });

    test("still allowed: future closures changed or deleted, past closures extended, open entries changed", async () => {
        const school = f.id();
        const future = await entry(school, at(5), at(6));
        expect((await update(school, future, { startDate: at(5), endDate: at(6), closesSchool: false })).status).toBe(200);

        const past = await entry(school, at(p3), at(p1));
        expect((await update(school, past, { startDate: at(p3), endDate: at(5), closesSchool: true })).status).toBe(200);

        const event = await entry(school, at(p3), at(p3), false);
        expect((await update(school, event, { startDate: at(10), endDate: at(10), closesSchool: true })).status).toBe(200);
        expect((await remove(school, event)).status).toBe(200);

        const later = await entry(school, at(20), at(21));
        expect((await remove(school, later)).status).toBe(200);
        expect(await stored(later)).toBeNull();
    });
});
