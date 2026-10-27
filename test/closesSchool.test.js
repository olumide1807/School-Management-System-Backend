// closesSchool must mean one thing. The register and the auto-marker ask
// the database (CLOSES_SCHOOL: { $ne: false }); everything else reads the
// entry in memory through closesSchool(). If the two ever disagree about
// an entry, the register is suppressed on a day the calendar calls open,
// or a day the register treated as closed can be reopened — which is what
// happened when Mongoose filled a school event's default (false) into
// stored entries that had no value.
//
// Rule: only an explicit false is open. Absent (or null) is closed.
const M = require("../models");
const { CLOSES_SCHOOL, closesSchool, findClosure } = require("../utils/schoolDay");
const calendar = require("../controller/schoolCalendar");
const portal = require("../controller/portal");
const { useTestDatabase } = require("./helpers/db");
const { run, asSchool, asParent } = require("./helpers/http");
const f = require("./helpers/factories");

useTestDatabase();

const TYPES = ["public_holiday", "school_break", "school_event", "other"];
const STORED = [["absent", undefined], ["null", null], ["true", true], ["false", false]];
const DAY = "2026-10-14"; // a Wednesday inside the factory term

// Writes the entry straight to the collection, so "absent" really is absent
const storeRaw = async (schoolId, type, value) => {
    const _id = f.id();
    const doc = { _id, schoolId, name: `${type} ${String(value)}`, type, startDate: f.D(DAY), endDate: f.D(DAY) };
    if (value !== undefined) doc.closesSchool = value;
    await M.schoolCalendarModel.collection.insertOne(doc);
    return _id;
};

describe("the helper and the query agree for every stored value and type", () => {
    const cases = TYPES.flatMap((type) => STORED.map(([label, value]) => [type, label, value]));

    test.each(cases)("%s, closesSchool %s", async (type, _label, value) => {
        const school = f.id();
        const _id = await storeRaw(school, type, value);
        const expected = value !== false; // only an explicit false is open

        const byQuery = !!(await M.schoolCalendarModel.findOne({ _id, ...CLOSES_SCHOOL }));
        const hydrated = await M.schoolCalendarModel.findById(_id);
        const lean = await M.schoolCalendarModel.findById(_id).lean();

        expect(byQuery).toBe(expected);
        expect(closesSchool(hydrated)).toBe(expected);
        expect(closesSchool(lean)).toBe(expected);
        // the register guard and auto-marker
        expect(!!(await findClosure(school, f.D(DAY)))).toBe(expected);
        // loading a stored entry never invents a value
        if (value === undefined) expect(hydrated.closesSchool).toBeUndefined();
    });
});

describe("what the API reports is the same reading", () => {
    test("the admin list and the portal calendar send the helper's answer for every case", async () => {
        const school = f.id();
        const sess = await f.session(school);
        await f.term(school, sess._id);
        const expected = {};
        for (const type of TYPES) {
            for (const [, value] of STORED) {
                await storeRaw(school, type, value);
                expected[`${type} ${String(value)}`] = value !== false;
            }
        }

        const list = await run(calendar.getCalendarEntries, { ...asSchool(school), query: {} });
        const fromList = Object.fromEntries(list.body.data.map((e) => [e.name, e.closesSchool]));
        expect(fromList).toEqual(expected);

        const cal = await run(portal.getPortalCalendar, asParent(f.id(), school));
        const fromPortal = Object.fromEntries(cal.body.data.entries.map((e) => [e.name, e.closesSchool]));
        expect(fromPortal).toEqual(expected);
    });
});

describe("new entries still default by type", () => {
    test.each([
        ["public_holiday", true], ["school_break", true], ["other", true], ["school_event", false],
    ])("%s with no choice → %s, stored explicitly", async (type, closes) => {
        const school = f.id();
        const r = await run(calendar.createCalendarEntry, { ...asSchool(school), body: { name: "New", type, startDate: "2026-11-02" } });
        expect(r.status).toBe(201);
        const raw = await M.schoolCalendarModel.collection.findOne({ schoolId: school });
        expect(raw.closesSchool).toBe(closes);
    });

    test("the model's backstop applies to a new document", () => {
        expect(new M.schoolCalendarModel({ type: "school_event" }).closesSchool).toBe(false);
        expect(new M.schoolCalendarModel({ type: "public_holiday" }).closesSchool).toBe(true);
    });
});

describe("an entry stored without the field, through the endpoints", () => {
    // The bug: hydrated as open, so a past one could be deleted, reopening
    // a day the register had treated as closed
    test("a past school event with no closesSchool can't be deleted", async () => {
        const school = f.id();
        const _id = f.id();
        const lastWeek = new Date(Date.now() - 7 * 86400000);
        lastWeek.setUTCHours(0, 0, 0, 0);
        while ([0, 6].includes(lastWeek.getUTCDay())) lastWeek.setUTCDate(lastWeek.getUTCDate() - 1);
        await M.schoolCalendarModel.collection.insertOne({ _id, schoolId: school, name: "Old event", type: "school_event", startDate: lastWeek, endDate: lastWeek });

        const r = await run(calendar.deleteCalendarEntry, { ...asSchool(school), params: { id: String(_id) } });
        expect(r.status).toBe(400);
        expect(await M.schoolCalendarModel.findById(_id)).not.toBeNull();
    });

    test("editing it without sending closesSchool saves it as closed, now written down", async () => {
        const school = f.id();
        const _id = f.id();
        const later = new Date(Date.now() + 30 * 86400000);
        later.setUTCHours(0, 0, 0, 0);
        await M.schoolCalendarModel.collection.insertOne({ _id, schoolId: school, name: "Old event", type: "school_event", startDate: later, endDate: later });

        const r = await run(calendar.updateCalendarEntry, {
            ...asSchool(school), params: { id: String(_id) },
            body: { name: "Renamed", type: "school_event", startDate: later.toISOString().slice(0, 10) },
        });
        expect(r.status).toBe(200);
        expect(r.body.data.closesSchool).toBe(true);
        expect((await M.schoolCalendarModel.collection.findOne({ _id })).closesSchool).toBe(true);
    });
});
