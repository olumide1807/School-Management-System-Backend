// One-off: give stored result entries the format snapshot they were saved
// without (see `format` in models/result.js).
//
// Without one, buildClassReport reads an entry against the CURRENT
// assessment format, so a later format change rewrites that past term:
// an attendance component added since gets appended to it, and its
// column headings show today's maxima over yesterday's scores.
//
// Only entries whose format can be known for certain are filled:
//   1. Its saved scores' maxima total 100. Formats must total 100
//      (controller/assessment.js), so those components WERE the whole
//      format: exactly them, with no attendance component.
//   2. Otherwise, it was entered after its class level's format was last
//      saved, so the current format is the one it was entered under.
// Anything else is left as it is and listed, to be decided by a person.
//
//   node scripts/backfillResultFormats.js           # dry run: report only
//   node scripts/backfillResultFormats.js --apply   # write the snapshots
//
// Only touches entries with no snapshot, so it's safe to re-run.

const dotenv = require("dotenv");
dotenv.config({ path: "./config/config.env" });
const mongoose = require("mongoose");

const apply = process.argv.includes("--apply");
const label = (defs) => defs.map((d) => `${d.name}/${d.maxScore}${d.source === "attendance" ? " (register)" : ""}`).join(", ");

(async () => {
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;
    const results = db.collection("results");
    const formats = await db.collection("assessments").find({}).toArray();
    const formatFor = (school, level) =>
        formats.find((f) => String(f.schoolId) === String(school) && String(f.classLevel) === String(level));

    console.log(`Database: ${db.databaseName}`);
    const plan = [];      // { _id, t, s, format, why }
    const undecided = [];

    for (const r of await results.find({}).toArray()) {
        (r.Terms || []).forEach((term, t) => {
            (term.subjects || []).forEach((entry, s) => {
                if (Array.isArray(entry.format) && entry.format.length) return;
                const scores = entry.scores || [];
                const where = `result ${r._id} term ${term.termId} subject ${entry.subject}`;

                const total = scores.reduce((sum, x) => sum + Number(x.maxScore || 0), 0);
                if (scores.length && total === 100) {
                    const format = scores.map((x, i) => ({ name: x.name, maxScore: x.maxScore, order: i + 1, source: "manual" }));
                    plan.push({ _id: r._id, t, s, format, where, why: "its scores total 100, so they were the whole format" });
                    return;
                }
                const current = formatFor(r.school, r.classLevel);
                const saved = current && (current.updatedAt || current.createdAt);
                if (current && entry.enteredAt && saved && new Date(entry.enteredAt) >= new Date(saved)) {
                    const format = [...current.assessments]
                        .sort((a, b) => (a.order || 0) - (b.order || 0))
                        .map((d) => ({ name: d.name, maxScore: d.maxScore, order: d.order || 0, source: d.source || "manual" }));
                    plan.push({ _id: r._id, t, s, format, where, why: "entered after the current format was last saved" });
                    return;
                }
                undecided.push(`${where}: scores ${label(scores)}; entered ${entry.enteredAt ? new Date(entry.enteredAt).toISOString() : "?"}; ` +
                    `current format ${current ? label(current.assessments) : "none"}, saved ${saved ? new Date(saved).toISOString() : "?"}`);
            });
        });
    }

    console.log(`Entries to fill: ${plan.length}`);
    plan.forEach((p) => console.log(`  ${p.where}\n    → ${label(p.format)}  (${p.why})`));
    console.log(`Left as they are (format can't be known): ${undecided.length}`);
    undecided.forEach((u) => console.log(`  ${u}`));

    if (!apply) {
        console.log("\nDry run — nothing written. Re-run with --apply to write the snapshots.");
        await mongoose.disconnect();
        return;
    }

    let written = 0;
    for (const p of plan) {
        const path = `Terms.${p.t}.subjects.${p.s}.format`;
        // Guard: only if still unset, so a concurrent score entry wins
        const r = await results.updateOne({ _id: p._id, [path]: { $exists: false } }, { $set: { [path]: p.format } });
        written += r.modifiedCount;
    }
    console.log(`\nApplied: ${written} entr${written === 1 ? "y" : "ies"} given a format snapshot.`);
    await mongoose.disconnect();
})().catch(async (e) => {
    console.error("Failed:", e.message);
    await mongoose.disconnect();
    process.exit(1);
});
