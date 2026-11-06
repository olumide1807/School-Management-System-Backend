// A student can't choose their own ID as a password. It's printed on their card
// and it's what they sign in with, so anyone holding the card would be in. Once
// first passwords became random, nothing stopped a student choosing it.
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || "1h";

const bcrypt = require("bcryptjs");
const M = require("../models");
const { changeOwnPassword, studentLogin } = require("../controller/auth");
const { useTestDatabase } = require("./helpers/db");
const { run } = require("./helpers/http");
const f = require("./helpers/factories");

useTestDatabase();

const ID = "GH/2026/0042";
const CURRENT = "CURRENTPASS22";

async function student() {
    const schoolId = f.id();
    const arm = await f.classArm(schoolId);
    return f.student(schoolId, arm._id, { studentID: ID, password: await bcrypt.hash(CURRENT, 4), mustChangePassword: true });
}
const change = (doc, newPassword, currentPassword = CURRENT) =>
    run(changeOwnPassword, { user: { id: doc.id, role: "student" }, body: { currentPassword, newPassword } });
const login = (password) => run(studentLogin, { body: { studentID: ID, password } });

test.each([
    ["exactly", ID],
    ["in lower case", ID.toLowerCase()],
    ["with spaces around it", `  ${ID} `],
    ["with spaces inside it", "GH / 2026 / 0042"],
])("refuses the student's own ID, %s, and changes nothing", async (_name, newPassword) => {
    const doc = await student();
    const r = await change(doc, newPassword);
    expect(r.status).toBe(400);
    expect(r.body.message || r.body.error).toMatch(/student ID/);

    const after = await M.studentModel.findById(doc._id).select("+password");
    expect(after.mustChangePassword).toBe(true);
    expect((await login(CURRENT)).status).toBe(200);
    expect((await login(newPassword)).status).toBe(401);
});

test("the wrong current password gets the usual answer, not one about the ID", async () => {
    const r = await change(await student(), ID, "WRONG");
    expect(r.status).toBe(401);
});

test("a student who still has their ID as a password still can't keep it", async () => {
    const doc = await student();
    doc.password = await bcrypt.hash(ID, 4);
    await doc.save();
    expect((await change(doc, ID, ID)).status).toBe(400);
});

test.each([["a different password", "my-own-secret"], ["one that only contains the ID", `${ID}-my-own-secret`]])(
    "accepts %s, and it signs in", async (_name, newPassword) => {
        const doc = await student();
        expect((await change(doc, newPassword)).status).toBe(200);
        expect((await login(newPassword)).status).toBe(200);
        expect((await M.studentModel.findById(doc._id)).mustChangePassword).toBe(false);
    });
