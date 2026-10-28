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
