// An admin resetting a staff member's password (PUT /staff/:id/reset-password).
// The handler called hashPassword, which was never defined, so every reset
// threw a ReferenceError and answered 500: no staff password could be reset.
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || "1h";

// Email isn't configured; the new password is returned for the admin to share
jest.mock("../utils/sendNotificationFallback", () => jest.fn(async () => false));

const bcrypt = require("bcryptjs");
const M = require("../models");
const staff = require("../controller/staff");
const { staffLogin } = require("../controller/auth");
const { useTestDatabase } = require("./helpers/db");
const { run, asSchool } = require("./helpers/http");
const f = require("./helpers/factories");

useTestDatabase();

beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test("the reset password works, and the old one stops working", async () => {
    const schoolId = f.id();
    await M.SuperAdminModel.collection.insertOne({ _id: schoolId, firstName: "Bisi", lastName: "Ade", emailAddress: "owner@greenhill.ng", schoolName: "Green Hill" });
    const doc = await M.staffModel.create({
        schoolId, firstName: "Tunde", surname: "Bello", emailAddress: "tunde@greenhill.ng", staffType: "academic",
        password: await bcrypt.hash("old-password", 4),
    });

    const r = await run(staff.resetStaffPassword, { ...asSchool(schoolId), params: { id: String(doc._id) } });
    expect(r.status).toBe(200);
    const newPassword = r.body.data.newPassword;

    expect((await run(staffLogin, { body: { email: "tunde@greenhill.ng", password: newPassword } })).status).toBe(200);
    expect((await run(staffLogin, { body: { email: "tunde@greenhill.ng", password: "old-password" } })).status).toBe(401);
});
