// Generated staff passwords come from the same generator as parent,
// student and super-admin passwords (utils/generatePortalPassword.js):
// crypto, an unambiguous alphabet, ~49 bits. The old one was 4 random
// bytes — six characters and "==" padding, ~32 bits.
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || "1h";

// Email isn't configured; the password is returned for the admin to share
jest.mock("../utils/sendNotificationFallback", () => jest.fn(async () => false));

const M = require("../models");
const { ALPHABET, LENGTH } = require("../utils/generatePortalPassword");
const staff = require("../controller/staff");
const { staffLogin } = require("../controller/auth");
const { useTestDatabase } = require("./helpers/db");
const { run, asSchool } = require("./helpers/http");
const f = require("./helpers/factories");

useTestDatabase();

const fromGenerator = (p) => typeof p === "string" && p.length === LENGTH && [...p].every((c) => ALPHABET.includes(c));

async function school() {
    const id = f.id();
    await M.SuperAdminModel.collection.insertOne({ _id: id, firstName: "Bisi", lastName: "Ade", emailAddress: "owner@greenhill.ng", schoolName: "Green Hill", schoolInitials: "GH" });
    return id;
}

beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test("a new staff member's password comes from the shared generator, and logs in", async () => {
    const schoolId = await school();
    const r = await run(staff.createStaff, {
        ...asSchool(schoolId),
        body: { firstName: "Tunde", surname: "Bello", emailAddress: "tunde@greenhill.ng" },
    });
    expect(r.status).toBe(201);
    const password = r.body.data?.temporaryPassword || r.body.message.match(/password is (\S+?),/)?.[1];
    expect(fromGenerator(password)).toBe(true);
    const login = await run(staffLogin, { body: { email: "tunde@greenhill.ng", password } });
    expect(login.status).toBe(200);
});

test("a reset staff password comes from the shared generator, and logs in", async () => {
    const schoolId = await school();
    const doc = await M.staffModel.create({ schoolId, firstName: "Tunde", surname: "Bello", emailAddress: "tunde@greenhill.ng", password: "old-hash", staffType: "academic" });
    const r = await run(staff.resetStaffPassword, { ...asSchool(schoolId), params: { id: String(doc._id) } });
    expect(r.status).toBe(200);
    expect(fromGenerator(r.body.data.newPassword)).toBe(true);
    const login = await run(staffLogin, { body: { email: "tunde@greenhill.ng", password: r.body.data.newPassword } });
    expect(login.status).toBe(200);
});

test("no padding, and no two alike", async () => {
    const schoolId = await school();
    const doc = await M.staffModel.create({ schoolId, firstName: "Tunde", surname: "Bello", emailAddress: "tunde@greenhill.ng", password: "old-hash", staffType: "academic" });
    const seen = new Set();
    for (let i = 0; i < 5; i++) {
        const r = await run(staff.resetStaffPassword, { ...asSchool(schoolId), params: { id: String(doc._id) } });
        expect(r.body.data.newPassword).not.toContain("=");
        seen.add(r.body.data.newPassword);
    }
    expect(seen.size).toBe(5);
});
