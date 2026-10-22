// One-off: convert fee item amounts from strings to numbers.
//
// Fee amounts used to be stored as strings with no format check, so
// "50,000" could be saved and read as 50 by the admin screens. The schema
// now stores a Number. This converts existing documents using the same
// rule as the validator (utils/feeAmount.js).
//
//   node scripts/convertFeeAmountsToNumbers.js           # dry run: report only
//   node scripts/convertFeeAmountsToNumbers.js --apply   # write the changes
//
// If ANY stored amount isn't cleanly a valid amount, it lists them and
// writes nothing — those need a person to decide what was meant.
// Amounts that are already numbers are left alone, so it's safe to re-run.

const dotenv = require("dotenv");
dotenv.config({ path: "./config/config.env" });
const mongoose = require("mongoose");
const { parseFeeAmount } = require("../utils/feeAmount");

const apply = process.argv.includes("--apply");

(async () => {
    await mongoose.connect(process.env.MONGO_URI);
    // The raw collection, not the model: we need to see exactly what's
    // stored, before the new schema casts anything
    const fees = mongoose.connection.db.collection("fees");
    const docs = await fees.find({}).toArray();

    const changes = [];   // { feeId, index, description, before, after }
    const problems = [];  // { feeId, index, description, before }
    let alreadyNumbers = 0;

    for (const doc of docs) {
        (doc.fees || []).forEach((item, index) => {
            if (typeof item.amount === "number") {
                if (parseFeeAmount(item.amount) === null) {
                    problems.push({ feeId: String(doc._id), index, description: item.description, before: item.amount });
                } else {
                    alreadyNumbers++;
                }
                return;
            }
            const minor = parseFeeAmount(item.amount);
            if (minor === null) {
                problems.push({ feeId: String(doc._id), index, description: item.description, before: item.amount });
            } else {
                changes.push({ feeId: String(doc._id), index, description: item.description, before: item.amount, after: minor / 100 });
            }
        });
    }

    console.log(`Database: ${mongoose.connection.db.databaseName}`);
    console.log(`Fee documents: ${docs.length}`);
    console.log(`Items already numbers: ${alreadyNumbers}`);
    console.log(`Items to convert: ${changes.length}`);
    for (const c of changes) {
        console.log(`  fee ${c.feeId} item ${c.index} "${c.description}": ${JSON.stringify(c.before)} (${typeof c.before}) -> ${c.after} (number)`);
    }

    if (problems.length > 0) {
        console.log(`\nSTOPPED: ${problems.length} amount(s) are not cleanly a valid amount. Nothing was written.`);
        for (const p of problems) {
            console.log(`  fee ${p.feeId} item ${p.index} "${p.description}": ${JSON.stringify(p.before)}`);
        }
        await mongoose.disconnect();
        process.exit(1);
    }

    if (!apply) {
        console.log("\nDry run — nothing written. Re-run with --apply to convert.");
        await mongoose.disconnect();
        return;
    }

    // One update per fee document, setting each converted item by index
    const byFee = {};
    for (const c of changes) (byFee[c.feeId] ||= {})[`fees.${c.index}.amount`] = c.after;
    let written = 0;
    for (const [feeId, set] of Object.entries(byFee)) {
        const r = await fees.updateOne({ _id: new mongoose.Types.ObjectId(feeId) }, { $set: set });
        written += r.modifiedCount;
    }
    console.log(`\nApplied: ${written} fee document(s) updated, ${changes.length} item(s) converted.`);
    await mongoose.disconnect();
})().catch(async (e) => {
    console.error("Failed:", e.message);
    await mongoose.disconnect();
    process.exit(1);
});
