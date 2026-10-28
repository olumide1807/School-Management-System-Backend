// The super-admin login must not say whether an email has an account.
// An unknown email and a wrong password get the same answer — as the
// staff, student and parent logins already do — or anyone can find the
// super-admin accounts one request at a time.
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || "1h";

const bcrypt = require("bcryptjs");
const M = require("../models");
const { loginSuperAdmin } = require("../controller/superAdmin");
const { useTestDatabase } = require("./helpers/db");
const { run } = require("./helpers/http");

useTestDatabase();

const login = (email, password) => run(loginSuperAdmin, { body: { email, password } });

beforeEach(async () => {
    // Straight into the collection: the model's school-profile validators
    // aren't what's under test
    await M.SuperAdminModel.collection.insertOne({
        firstName: "Bisi", lastName: "Ade", emailAddress: "owner@greenhill.ng",
        password: await bcrypt.hash("correct-horse", 4), schoolName: "Green Hill",
    });
});

test("an unknown email gets exactly the answer a wrong password gets", async () => {
    const unknown = await login("nobody@example.com", "whatever-1");
    const wrongPassword = await login("owner@greenhill.ng", "whatever-1");
    expect(wrongPassword).toEqual({ status: 401, body: { success: false, error: "Invalid credentials" } });
    expect(unknown).toEqual(wrongPassword);
});

test("the right email and password still log in", async () => {
    const r = await login("owner@greenhill.ng", "correct-horse");
    expect(r.status).toBe(200);
    expect(r.body.token).toEqual(expect.any(String));
});
