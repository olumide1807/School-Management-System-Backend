// A password-reset token is a credential. On parents and students it's
// select:false, so list endpoints never return it — /student/class/:id is
// open to every member of staff. Code that needs it asks for it by name.
const M = require("../models");
const student = require("../controller/student");
const parent = require("../controller/parent");
const { useTestDatabase } = require("./helpers/db");
const { run, asSchool } = require("./helpers/http");
const f = require("./helpers/factories");

useTestDatabase();

const TOKEN = { resetPasswordToken: "4821", resetPasswordExpire: new Date(Date.now() + 600000) };

async function world() {
    const school = f.id();
    const arm = await f.classArm(school);
    const kid = await f.student(school, arm._id);
    const parentId = f.id();
    await M.parentModel.collection.insertOne({ _id: parentId, schoolId: school, firstName: "Bisi", surName: "Ade", email: "bisi@example.com", password: "hash" });
    // Written straight to the documents, as a reset flow would
    await M.studentModel.collection.updateOne({ _id: kid._id }, { $set: TOKEN });
    await M.parentModel.collection.updateOne({ _id: parentId }, { $set: TOKEN });
    return { school, arm, kid, parentId };
}
const leaks = (body) => /resetPassword(Token|Expire)/.test(JSON.stringify(body));

describe("list endpoints never return reset tokens", () => {
    test("GET /student (all students)", async () => {
        const w = await world();
        const r = await run(student.getAllStudents, { ...asSchool(w.school), query: {} });
        expect(r.status).toBe(200);
        expect(r.body.data).toHaveLength(1);
        expect(leaks(r.body)).toBe(false);
    });

    test("GET /student/class/:classArmId — open to any staff member", async () => {
        const w = await world();
        const r = await run(student.getAllStudentsInAClass, { ...asSchool(w.school), params: { classArmId: String(w.arm._id) } });
        expect(r.status).toBe(200);
        expect(leaks(r.body)).toBe(false);
    });

    test("GET /parent (all parents)", async () => {
        const w = await world();
        const r = await run(parent.getAllParents, { ...asSchool(w.school), query: {} });
        expect(r.status).toBe(200);
        expect(r.body.data).toHaveLength(1);
        expect(leaks(r.body)).toBe(false);
    });
});

describe("the models hide them by default, and still give them up when asked", () => {
    test.each([["student", "studentModel"], ["parent", "parentModel"]])("%s", async (_label, model) => {
        const w = await world();
        const id = model === "studentModel" ? w.kid._id : w.parentId;
        const plain = await M[model].findById(id).lean();
        expect(plain).not.toHaveProperty("resetPasswordToken");
        expect(plain).not.toHaveProperty("resetPasswordExpire");
        const asked = await M[model].findById(id).select("+resetPasswordToken +resetPasswordExpire").lean();
        expect(asked.resetPasswordToken).toBe("4821");
        expect(asked.resetPasswordExpire).toEqual(TOKEN.resetPasswordExpire);
    });
});

// Staff and super admins are where reset tokens and OTPs actually exist
// (the forgot-password flow covers them). Same rule: hidden unless a query
// asks for them by name.
describe("staff and super-admin reset state is hidden too", () => {
    const staff = require("../controller/staff");
    const passwords = require("../controller/passwords");
    const RESET_FIELDS = /resetPassword(Token|Expire)|resetOtp/;

    // A live reset token, and a live code requested after it
    async function staffMidReset() {
        const schoolId = f.id();
        const doc = await M.staffModel.create({ schoolId, firstName: "Tunde", surname: "Bello", emailAddress: "tunde@greenhill.ng", staffType: "academic", password: "hash" });
        await M.staffModel.collection.updateOne({ _id: doc._id }, {
            $set: {
                resetPasswordToken: "f".repeat(64), resetPasswordExpire: new Date(Date.now() + 600000),
                resetOtpHash: "e".repeat(64), resetOtpExpire: new Date(Date.now() + 600000), resetOtpAttempts: 1, resetOtpRequests: [new Date()],
            },
        });
        return { schoolId, doc };
    }

    test("GET /staff (all staff) doesn't return them", async () => {
        const { schoolId } = await staffMidReset();
        const r = await run(staff.getAllStaffs, { ...asSchool(schoolId), query: {} });
        expect(r.status).toBe(200);
        expect(r.body.data).toHaveLength(1);
        expect(RESET_FIELDS.test(JSON.stringify(r.body))).toBe(false);
    });

    test("a staff document loaded any ordinary way doesn't carry them", async () => {
        const { doc } = await staffMidReset();
        const plain = await M.staffModel.findById(doc._id).lean();
        expect(RESET_FIELDS.test(JSON.stringify(plain))).toBe(false);
        const asked = await M.staffModel.findById(doc._id).select("+resetPasswordToken +resetPasswordExpire").lean();
        expect(asked.resetPasswordToken).toBe("f".repeat(64));
    });

    test("a super admin document doesn't carry them", async () => {
        const id = f.id();
        await M.SuperAdminModel.collection.insertOne({
            _id: id, emailAddress: "owner@greenhill.ng", schoolName: "Green Hill",
            resetPasswordToken: "f".repeat(64), resetPasswordExpire: new Date(Date.now() + 600000), resetOtpHash: "e".repeat(64),
        });
        const plain = await M.SuperAdminModel.findById(id).lean();
        expect(RESET_FIELDS.test(JSON.stringify(plain))).toBe(false);
    });

    test("the reset flow still works with everything hidden", async () => {
        jest.spyOn(console, "log").mockImplementation(() => {});
        const { doc } = await staffMidReset();
        // A token the flow issued itself
        await M.staffModel.collection.updateOne({ _id: doc._id }, {
            $set: { resetPasswordToken: require("crypto").createHash("sha256").update("a".repeat(64)).digest("hex") },
        });
        const r = await run(passwords.resetPassword, { body: { token: "a".repeat(64), password: "a-new-password" } });
        expect(r.status).toBe(200);
        jest.restoreAllMocks();
    });
});
