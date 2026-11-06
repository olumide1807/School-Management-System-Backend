// A token that can't be signed must fail the request. GenerateSignature used
// to return the error object, so a missing JWT_SECRET gave a super admin a 200
// with token: {} and then a 401 on their next request.
const bcrypt = require("bcryptjs");
const M = require("../models");
const { GenerateSignature } = require("../utils");
const { loginSuperAdmin } = require("../controller/superAdmin");
const { staffLogin, studentLogin, parentLogin } = require("../controller/auth");
const { useTestDatabase } = require("./helpers/db");
const { run } = require("./helpers/http");
const f = require("./helpers/factories");

useTestDatabase();

const PASSWORD = "correct-horse";
const saved = { JWT_SECRET: process.env.JWT_SECRET, JWT_EXPIRE: process.env.JWT_EXPIRE };
const setEnv = (values) => {
    for (const [k, v] of Object.entries(values)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
};

beforeEach(() => {
    setEnv({ JWT_SECRET: "test-secret", JWT_EXPIRE: "1h" });
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
    setEnv(saved);
    jest.restoreAllMocks();
});

async function logins() {
    const hash = await bcrypt.hash(PASSWORD, 4);
    const school = f.id();
    await M.SuperAdminModel.collection.insertOne({ emailAddress: "owner@greenhill.ng", password: hash, schoolName: "Green Hill" });
    await M.staffModel.create({ schoolId: school, firstName: "Tunde", surname: "Bello", emailAddress: "tunde@greenhill.ng", staffType: "academic", password: hash });
    const arm = await f.classArm(school);
    await f.student(school, arm._id, { studentID: "GH/1001", password: hash });
    await M.parentModel.collection.insertOne({ schoolId: school, email: "ada@example.com", password: hash });
    return {
        "super admin": () => run(loginSuperAdmin, { body: { email: "owner@greenhill.ng", password: PASSWORD } }),
        "staff": () => run(staffLogin, { body: { email: "tunde@greenhill.ng", password: PASSWORD } }),
        "student": () => run(studentLogin, { body: { studentID: "GH/1001", password: PASSWORD } }),
        "parent": () => run(parentLogin, { body: { email: "ada@example.com", password: PASSWORD } }),
    };
}

describe("GenerateSignature", () => {
    test("returns a token it can verify", () => {
        expect(GenerateSignature("abc")).toEqual(expect.any(String));
    });

    test("throws with no secret, and with no expiry, rather than returning the error", () => {
        setEnv({ JWT_SECRET: undefined });
        expect(() => GenerateSignature("abc")).toThrow("secretOrPrivateKey");
        setEnv({ JWT_SECRET: "test-secret", JWT_EXPIRE: undefined });
        expect(() => GenerateSignature("abc")).toThrow("expiresIn");
    });
});

describe("every login", () => {
    test("with a secret: 200 and a real token", async () => {
        for (const [who, login] of Object.entries(await logins())) {
            const r = await login();
            expect({ who, status: r.status, token: typeof r.body.token }).toEqual({ who, status: 200, token: "string" });
        }
    });

    test("with no secret: a 500 and no token, never a 200", async () => {
        const all = await logins();
        setEnv({ JWT_SECRET: undefined });
        for (const [who, login] of Object.entries(all)) {
            const r = await login();
            expect({ who, status: r.status, token: r.body.token }).toEqual({ who, status: 500, token: undefined });
        }
    });
});
