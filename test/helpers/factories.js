// Minimal valid documents for tests. Each takes overrides; anything a test
// doesn't care about gets a plausible default.
const mongoose = require("mongoose");
const M = require("../../models");

const id = () => new mongoose.Types.ObjectId();
let seq = 0;
const D = (day) => new Date(`${day}T00:00:00.000Z`);

const classArm = async (schoolId, levelShortName = "JSS1", armName = "a") => {
    const level = await M.classLevelModel.create({ schoolId, levelName: `Level ${levelShortName}`, levelShortName });
    return M.classArmModel.create({ schoolId, classLevelId: level._id, armName });
};

const session = (schoolId, o = {}) => M.sessionModel.create({ schoolId, sessionName: "2026/2027", currentSession: true, ...o });

const term = (schoolId, sessionId, o = {}) =>
    M.termModel.create({ schoolId, sessionId, termName: "First Term", currentTerm: true, termStartDate: D("2026-09-14"), termEndDate: D("2026-12-11"), ...o });

const student = (schoolId, classArmId, o = {}) => {
    seq += 1;
    return M.studentModel.create({
        schoolId, classArmId,
        studentID: `T/${String(seq).padStart(4, "0")}`,
        firstName: "Tobi", surName: "Ade", gender: "male", dateOfBirth: D("2014-03-02"),
        country: "Nigeria", stateOfOrigin: "Lagos", localGovernmentArea: "Ikeja",
        address: { number: 4, street: "Allen Avenue", city: "Ikeja", state: "Lagos" },
        password: "not-a-real-hash",
        ...o,
    });
};

const fee = (schoolId, termId, classArmId, items, o = {}) =>
    M.feeModel.create({ schoolId, termId, classArmId, currency: "NGN", fees: items, ...o });

const payment = (schoolId, studentId, feeId, o = {}) =>
    M.paymentModel.create({ schoolId, studentId, feeId, amount: 1000, paymentMethod: "cash", paymentDate: D("2026-10-01"), ...o });

module.exports = { id, D, classArm, session, term, student, fee, payment };
