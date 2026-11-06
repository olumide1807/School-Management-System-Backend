// Reset codes and generated passwords never reach the console in production,
// whether email works or not: anyone with log access could take any account.
// They do in local development, where they're the only way to see one.
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || "1h";

// A known value for every secret, so the console can be searched for it
const PASSWORD = "KNOWNPASS22";
const CODE = 654321;
jest.mock("../utils/generatePortalPassword", () => ({
    ...jest.requireActual("../utils/generatePortalPassword"),
    generatePortalPassword: () => "KNOWNPASS22",
}));
jest.mock("../utils/generateRandomOTP", () => ({ generateRandomOTP: () => 654321 }));
jest.mock("../utils/sendEmail", () => jest.fn());
// Nothing fills this cache today (registration bypasses it), so
// acceptApplication is unreachable, but its log line is still held here
const mockInvitation = { value: undefined };
jest.mock("node-cache", () => function FakeCache() {
    return { take: () => mockInvitation.value, set() {}, get() {} };
});

const M = require("../models");
const sendEmail = require("../utils/sendEmail");
const passwords = require("../controller/passwords");
const parents = require("../controller/parent");
const students = require("../controller/student");
const superAdmin = require("../controller/superAdmin");
const { useTestDatabase } = require("./helpers/db");
const { run, asSchool } = require("./helpers/http");
const f = require("./helpers/factories");

useTestDatabase();

const savedEnv = process.env.NODE_ENV;
let lines;
beforeEach(() => {
    lines = [];
    for (const method of ["log", "error", "warn", "info", "debug"]) {
        jest.spyOn(console, method).mockImplementation((...a) => lines.push(a.map(String).join(" ")));
    }
});
afterEach(() => {
    process.env.NODE_ENV = savedEnv;
    jest.restoreAllMocks();
});
const settle = () => new Promise((r) => setTimeout(r, 0));
const consoleHas = (secret) => lines.some((l) => l.includes(String(secret)));

const adminDetails = (n) => ({
    firstName: "Bisi", lastName: "Ade", emailAddress: `owner${n}@greenhill.ng`, phoneNumber: "08030000000",
    schoolName: `Green Hill ${n}`, schoolEmailAddress: `school${n}@greenhill.ng`,
    schoolAddress: { number: 4, street: "Allen Avenue", city: "Ikeja", state: "Lagos", country: "Nigeria" },
});
const parentDetails = {
    title: "Mrs", firstName: "Ada", surName: "Obi", gender: "female", maritalStatus: "married",
    email: "ada@example.com", phoneNumber: "08030000001", occupation: "Trader", country: "Nigeria",
    address: { number: 4, street: "Allen Avenue", city: "Ikeja", state: "Lagos", postalCode: "100001", country: "Nigeria" },
};

// Every path that used to log a secret. Each returns the response, to show it
// really ran.
const PATHS = {
    "creating a parent": async () => {
        const school = f.id();
        return { r: await run(parents.createParent, { ...asSchool(school), body: { ...parentDetails } }), want: 201, secret: PASSWORD };
    },
    "registering a student with a new parent": async () => {
        const school = f.id();
        await superAdminDoc(school);
        const arm = await f.classArm(school);
        const r = await run(students.registerStudent, {
            ...asSchool(school),
            body: {
                classArmId: String(arm._id), firstName: "Tobi", surName: "Obi", gender: "male", dateOfBirth: "2014-03-02",
                country: "Nigeria", stateOfOrigin: "Lagos", localGovernmentArea: "Ikeja",
                address: { street: "Allen Avenue", city: "Ikeja", state: "Lagos", country: "Nigeria" },
                parentTitle: "Mrs", parentFirstName: "Ada", parentSurName: "Obi", parentGender: "female", maritalStatus: "married",
                parentEmail: "ada@example.com", parentPhoneNumber: "08030000001", parentCountry: "Nigeria", occupation: "Trader",
                parentAddress: parentDetails.address, relationship: "Mother",
            },
        });
        return { r, want: 201, secret: PASSWORD };
    },
    "a school signing up": async () => ({ r: await run(superAdmin.registerSuperAdmin, { body: adminDetails(1) }), want: 200, secret: PASSWORD }),
    "accepting an invitation": async () => {
        mockInvitation.value = adminDetails(2);
        const r = await run(superAdmin.acceptApplication, { params: { signature: "s" } });
        // Its answer depends on the email; what matters is the account was made
        expect(await M.SuperAdminModel.countDocuments({ emailAddress: "owner2@greenhill.ng" })).toBe(1);
        return { r, want: null, secret: PASSWORD };
    },
    "asking for a reset code": async () => {
        await run(superAdmin.registerSuperAdmin, { body: adminDetails(3) });
        lines.length = 0;
        const r = await run(passwords.forgotPassword, { body: { email: "owner3@greenhill.ng" } });
        await settle();
        return { r, want: 200, secret: CODE };
    },
};
const superAdminDoc = (school) =>
    M.SuperAdminModel.collection.insertOne({ _id: school, schoolName: "Green Hill", schoolInitials: "GH" });

const EMAIL = {
    "email fails": () => sendEmail.mockResolvedValue({ status: false, message: "not sent" }),
    "email throws": () => sendEmail.mockRejectedValue(new Error("no connection")),
    "email works": () => sendEmail.mockResolvedValue({ status: true, message: "sent" }),
};

describe.each(Object.keys(PATHS))("%s", (name) => {
    test.each(Object.keys(EMAIL))("production, %s: the secret never reaches the console", async (email) => {
        process.env.NODE_ENV = "production";
        EMAIL[email]();
        const { r, want, secret } = await PATHS[name]();
        if (want) expect(r.status).toBe(want);
        await settle();
        expect(lines.filter((l) => l.includes(String(secret)))).toEqual([]);
    });
});

// What was logged before this change stays available locally
describe.each(["development", undefined])("NODE_ENV=%s", (env) => {
    const set = () => {
        if (env === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = env;
    };

    test.each(Object.keys(PATHS))("%s, with email failing: the secret is logged", async (name) => {
        set();
        EMAIL["email fails"]();
        const { r, want, secret } = await PATHS[name]();
        if (want) expect(r.status).toBe(want);
        await settle();
        expect(consoleHas(secret)).toBe(true);
    });
});
