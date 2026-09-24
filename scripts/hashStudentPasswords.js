/**
 * One-off migration: hash existing student passwords.
 *
 * Students created before password hashing had their student ID stored
 * as a plaintext password. This rewrites each of those as a bcrypt hash
 * of the same value, so the student's initial password is unchanged but
 * is no longer readable from the database.
 *
 * Safe to run more than once — records already hashed are skipped.
 *
 * Run from the backend root:  node scripts/hashStudentPasswords.js
 * Delete this file once it has been run everywhere it needs to be.
 */

require("dotenv").config({ path: "./config/config.env" });
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const studentModel = require("../models/student");

// bcrypt hashes start with $2a$, $2b$ or $2y$
const isHashed = (value) => typeof value === "string" && value.startsWith("$2");

(async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected.");

        const students = await studentModel.find({}).select("+password studentID");
        console.log(`Found ${students.length} students.`);

        let hashed = 0;
        let skipped = 0;
        let blank = 0;

        for (const student of students) {
            if (isHashed(student.password)) {
                skipped++;
                continue;
            }

            // Keep whatever the password currently is; if it's missing,
            // fall back to the student ID, which is the documented default
            const plain = student.password || student.studentID;
            if (!plain) {
                console.warn(`  ${student.studentID}: no password and no ID, skipped`);
                blank++;
                continue;
            }

            const salt = await bcrypt.genSalt(10);
            student.password = await bcrypt.hash(plain, salt);
            student.mustChangePassword = true;
            await student.save();
            hashed++;
        }

        console.log(`\nHashed: ${hashed}`);
        console.log(`Already hashed, skipped: ${skipped}`);
        if (blank) console.log(`Could not fix: ${blank}`);

        await mongoose.disconnect();
        process.exit(0);
    } catch (e) {
        console.error("Migration failed:", e);
        process.exit(1);
    }
})();
