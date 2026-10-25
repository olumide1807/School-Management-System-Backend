// One-off: give every existing calendar entry closesSchool: true.
//
// Before closesSchool existed, EVERY calendar entry closed the school,
// whatever its type — no register, no auto-marked absences, the day left
// out of attendance. The auto-marker and the attendance views have already
// acted on that for these days. If an existing entry (say a past "school
// event") turned into an open day, the attendance views would start
// listing it as a register nobody took for every child, and an entry for
// today would get every student auto-marked absent after closing time.
// Keeping existing entries closed preserves exactly what has happened.
// New entries get the type default (see models/schoolCalendar.js).
//
//   node scripts/setCalendarClosesSchool.js           # dry run: report only
//   node scripts/setCalendarClosesSchool.js --apply   # write the changes
//
// Only touches entries with no closesSchool value, so it's safe to re-run
// and never overrides a choice made after this field existed.

const dotenv = require("dotenv");
dotenv.config({ path: "./config/config.env" });
const mongoose = require("mongoose");

const apply = process.argv.includes("--apply");
const day = (d) => new Date(d).toISOString().slice(0, 10);

(async () => {
    await mongoose.connect(process.env.MONGO_URI);
    // The raw collection: we need to see which documents lack the field,
    // before the schema's default fills it in on read
    const cal = mongoose.connection.db.collection("schoolcalendars");
    const all = await cal.find({}).sort({ schoolId: 1, startDate: 1 }).toArray();
    const missing = all.filter((e) => e.closesSchool === undefined || e.closesSchool === null);
    const already = all.filter((e) => typeof e.closesSchool === "boolean");

    console.log(`Database: ${mongoose.connection.db.databaseName}`);
    console.log(`Calendar entries: ${all.length}`);
    console.log(`Already have closesSchool: ${already.length}`);
    console.log(`Missing closesSchool (to set to true): ${missing.length}`);
    const byType = {};
    missing.forEach((e) => { byType[e.type || "(none)"] = (byType[e.type || "(none)"] || 0) + 1; });
    console.log(`  by type: ${JSON.stringify(byType)}`);
    for (const e of missing) {
        console.log(`  ${String(e._id)} school ${String(e.schoolId)}  "${e.name}" [${e.type}] ${day(e.startDate)}→${day(e.endDate)}: closesSchool (unset) -> true`);
    }

    if (!apply) {
        console.log("\nDry run — nothing written. Re-run with --apply to set them.");
        await mongoose.disconnect();
        return;
    }

    const r = await cal.updateMany(
        { $or: [{ closesSchool: { $exists: false } }, { closesSchool: null }] },
        { $set: { closesSchool: true } }
    );
    console.log(`\nApplied: ${r.modifiedCount} entr${r.modifiedCount === 1 ? "y" : "ies"} set to closesSchool: true.`);
    await mongoose.disconnect();
})().catch(async (e) => {
    console.error("Failed:", e.message);
    await mongoose.disconnect();
    process.exit(1);
});
