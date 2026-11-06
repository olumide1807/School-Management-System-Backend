// No account's password may be one of its own identifiers, on any path that
// sets a password. These are what other people already know: an admin's email
// is known to the whole school, and a staff ID is printed on a card.
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || "1h";

// Lets a test make the generator produce an identifier first
const mockNextPasswords = [];
jest.mock("../utils/generatePortalPassword", () => {
    const actual = jest.requireActual("../utils/generatePortalPassword");
    return { ...actual, generatePortalPassword: () => mockNextPasswords.shift() || actual.generatePortalPassword() };
});
jest.mock("../utils/sendEmail", () => jest.fn(async () => ({ status: false, message: "not sent" })));
jest.mock("../utils/sendNotificationFallback", () => jest.fn(async () => false));
const mockInvitation = { value: undefined };
jest.mock("node-cache", () => function FakeCache() {
    return { take: () => mockInvitation.value, set() {}, get() {} };
});

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const M = require("../models");
const auth = require("../controller/auth");
const staff = require("../controller/staff");
const parents = require("../controller/parent");
const students = require("../controller/student");
const superAdmin = require("../controller/superAdmin");
const passwords = require("../controller/passwords");
const { useTestDatabase } = require("./helpers/db");
const { run, asSchool } = require("./helpers/http");
const f = require("./helpers/factories");

useTestDatabase();

const CURRENT = "CURRENTPASS22";
const GOOD = "my-own-secret-22";
const refused = (r) => {
    expect(r.status).toBe(400);
    expect(r.body.message || r.body.error).toMatch(/can't be your/);
};

beforeEach(() => {
    mockNextPasswords.length = 0;
    for (const m of ["log", "error"]) jest.spyOn(console, m).mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const address = { number: 4, street: "Allen Avenue", city: "Ikeja", state: "Lagos", postalCode: "100001", country: "Nigeria" };
const parentDetails = {
    title: "Mrs", firstName: "Adaeze", surName: "Obiora", gender: "female", maritalStatus: "married",
    email: "adaeze.obi@example.com", phoneNumber: "08031234567", occupation: "Trader", country: "Nigeria", address,
};
const parentDoc = async () => M.parentModel.create({ ...parentDetails, schoolId: f.id(), password: await bcrypt.hash(CURRENT, 4) });
const staffDoc = async () => M.staffModel.create({
    schoolId: f.id(), firstName: "Tunde", surname: "Bello", otherName: "Oluwaseun", emailAddress: "tunde.bello@greenhill.ng",
    staffType: "academic", staffID: "GH/S1234", phoneNumber: "+2348039876543", password: await bcrypt.hash(CURRENT, 4),
});
const studentDoc = async () => {
    const schoolId = f.id();
    return f.student(schoolId, (await f.classArm(schoolId))._id, {
        firstName: "Tobechukwu", surName: "Adeyemi", otherName: "Chinedu", studentID: "GH/2026/0042",
        email: "tobe.adeyemi@example.com", phoneNumber: "08051112222", password: await bcrypt.hash(CURRENT, 4),
    });
};
const adminDetails = (n = "") => ({
    firstName: "Bisolami", lastName: "Adeleke", emailAddress: `owner${n}@greenhill.ng`, phoneNumber: "08030000000",
    schoolName: `Green Hill Academy${n}`, schoolEmailAddress: `office${n}@greenhill.ng`, schoolInitials: "GHAC",
    schoolAddress: { number: 4, street: "Allen Avenue", city: "Ikeja", state: "Lagos", country: "Nigeria" },
});
// A complete super admin, as signing up leaves one, so saving it can succeed
const adminDoc = async () => M.SuperAdminModel.create({ ...adminDetails(), password: await bcrypt.hash(CURRENT, 4) });

const changeStudent = (doc, newPassword) => run(auth.changeOwnPassword, { user: { id: doc.id, role: "student" }, body: { currentPassword: CURRENT, newPassword } });
const changeParent = (doc, newPassword) => run(auth.changeOwnPassword, { user: { id: doc.id, role: "parent" }, body: { currentPassword: CURRENT, newPassword } });
const changeStaff = (doc, newPassword) => run(staff.updateStaffPassword, { user: { id: doc.id }, body: { currentPassword: CURRENT, newPassword } });
const changeAdmin = (doc, newPassword) => run(superAdmin.updatePassword, { ...asSchool(doc._id), body: { currentPassword: CURRENT, newPassword } });
const stored = async (doc) => (await doc.constructor.findById(doc._id).select("+password")).password;

describe.each([
    ["student", studentDoc, changeStudent, [
        ["student ID", "GH/2026/0042"], ["email", "tobe.adeyemi@example.com"], ["phone number", "08051112222"],
        ["first name", "Tobechukwu"], ["surname", "Adeyemi"], ["other name", "Chinedu"], ["full name", "Tobechukwu Adeyemi"],
    ]],
    ["parent", parentDoc, changeParent, [
        ["email", "adaeze.obi@example.com"], ["the email's name part", "adaeze.obi"], ["phone number", "08031234567"],
        ["phone number in international form", "+2348031234567"], ["first name", "Adaeze"], ["surname", "Obiora"], ["full name", "Obiora Adaeze"],
    ]],
    ["staff member", staffDoc, changeStaff, [
        ["staff ID", "GH/S1234"], ["email", "tunde.bello@greenhill.ng"], ["the email's name part", "tunde.bello"],
        ["phone number", "+2348039876543"], ["phone number in local form", "08039876543"], ["other name", "Oluwaseun"], ["full name", "Tunde Bello"],
    ]],
    ["super admin", adminDoc, changeAdmin, [
        ["email", "owner@greenhill.ng"], ["school email", "office@greenhill.ng"], ["phone number", "08030000000"],
        ["school name", "Green Hill Academy"], ["first name", "Bisolami"], ["surname", "Adeleke"], ["full name", "Bisolami Adeleke"],
    ]],
])("a %s changing their own password", (_who, make, change, identifiers) => {
    test.each(identifiers)("refuses their %s, and changes nothing", async (_name, value) => {
        const doc = await make();
        const before = await stored(doc);
        refused(await change(doc, value));
        expect(await stored(doc)).toBe(before);
    });

    test.each(identifiers)("refuses their %s however it's typed", async (_name, value) => {
        const doc = await make();
        refused(await change(doc, `  ${value.toUpperCase()} `));
        refused(await change(doc, value.toLowerCase().split("").join(" ")));
    });

    test.each([["a different password", GOOD], ["one that only contains an identifier", `${identifiers[0][1]}-${GOOD}`]])(
        "accepts %s", async (_name, value) => {
            const doc = await make();
            const before = await stored(doc);
            expect((await change(doc, value)).status).toBe(200);
            expect(await stored(doc)).not.toBe(before);
        });
});

test("a refused student stays as they were: still asked to change, and signing in as before", async () => {
    const doc = await studentDoc();
    refused(await changeStudent(doc, "GH/2026/0042"));
    expect((await M.studentModel.findById(doc._id)).mustChangePassword).toBe(true);
    expect((await run(auth.studentLogin, { body: { studentID: "GH/2026/0042", password: CURRENT } })).status).toBe(200);
    expect((await run(auth.studentLogin, { body: { studentID: "GH/2026/0042", password: "GH/2026/0042" } })).status).toBe(401);
});

test("the wrong current password gets the usual answer, not one about the identifier", async () => {
    const doc = await studentDoc();
    const r = await run(auth.changeOwnPassword, { user: { id: doc.id, role: "student" }, body: { currentPassword: "WRONG", newPassword: "GH/2026/0042" } });
    expect(r.status).toBe(401);
});

test("a student who still has their ID as a password can't keep it", async () => {
    const doc = await studentDoc();
    doc.password = await bcrypt.hash("GH/2026/0042", 4);
    await doc.save();
    const r = await run(auth.changeOwnPassword, { user: { id: doc.id, role: "student" }, body: { currentPassword: "GH/2026/0042", newPassword: "GH/2026/0042" } });
    refused(r);
});

test("nothing of letters at all can't match a blank identifier", async () => {
    const doc = await staffDoc();
    await M.staffModel.updateOne({ _id: doc._id }, { $set: { otherName: "", phoneNumber: "" } });
    expect((await changeStaff(doc, "!!!!!!!!")).status).toBe(200);
});

describe("reset by code", () => {
    const withToken = async (doc) => {
        const token = crypto.randomBytes(32).toString("hex");
        await doc.constructor.updateOne({ _id: doc._id }, {
            $set: { resetPasswordToken: crypto.createHash("sha256").update(token).digest("hex"), resetPasswordExpire: new Date(Date.now() + 60000) },
        });
        return token;
    };
    const reset = (token, password) => run(passwords.resetPassword, { body: { token, password } });

    test.each([
        ["staff ID", staffDoc, "GH/S1234"], ["staff email", staffDoc, "Tunde.Bello@greenhill.ng"], ["staff phone", staffDoc, "08039876543"],
        ["super admin email", adminDoc, "OWNER@greenhill.ng"], ["school email", adminDoc, "office@greenhill.ng"], ["school name", adminDoc, "green hill academy"],
    ])("refuses the %s, keeps the old password, and doesn't spend the code", async (_name, make, value) => {
        const doc = await make();
        const before = await stored(doc);
        const token = await withToken(doc);
        refused(await reset(token, value));
        expect(await stored(doc)).toBe(before);
        expect((await reset(token, GOOD)).status).toBe(200);
        expect(await stored(doc)).not.toBe(before);
    });

    test("a reset still works only once", async () => {
        const token = await withToken(await staffDoc());
        expect((await reset(token, GOOD)).status).toBe(200);
        expect((await reset(token, `${GOOD}x`)).status).toBe(400);
    });

    test("a wrong token gets the expired answer, whatever the password: it says nothing about any account", async () => {
        await staffDoc();
        const r = await reset("a".repeat(64), "tunde.bello@greenhill.ng");
        expect(r.status).toBe(400);
        expect(r.body.message || r.body.error).toMatch(/expired/);
    });
});

// The generator can't realistically produce one of these. This holds the rule
// that no path gets a password past the check, generated or chosen.
describe("generated passwords", () => {
    const AFTER = "ABCDE23456";
    const paths = [
        ["a new staff member", "tunde@greenhill.ng", async () => {
            const school = f.id();
            await M.SuperAdminModel.collection.insertOne({ _id: school, schoolName: "Green Hill", schoolInitials: "GH" });
            const r = await run(staff.createStaff, { ...asSchool(school), body: { firstName: "Tunde", surname: "Bello", emailAddress: "tunde@greenhill.ng" } });
            return r.body.data.temporaryPassword;
        }],
        ["a new parent", parentDetails.email, async () => {
            const r = await run(parents.createParent, { ...asSchool(f.id()), body: { ...parentDetails } });
            return r.body.data?.password || r.body.data?.initialPassword || r.body.initialPassword || r.body.data?.temporaryPassword;
        }],
        ["a new student", "tobi@example.com", async () => {
            const school = f.id();
            await M.SuperAdminModel.collection.insertOne({ _id: school, schoolName: "Green Hill", schoolInitials: "GH" });
            const arm = await f.classArm(school);
            const r = await run(students.registerStudent, {
                ...asSchool(school),
                body: {
                    classArmId: String(arm._id), firstName: "Tobi", surName: "Obi", gender: "male", dateOfBirth: "2014-03-02", email: "tobi@example.com",
                    country: "Nigeria", stateOfOrigin: "Lagos", localGovernmentArea: "Ikeja",
                    address: { street: "Allen Avenue", city: "Ikeja", state: "Lagos", country: "Nigeria" },
                },
            });
            return r.body.initialPassword;
        }],
        ["a school signing up", "owner5@greenhill.ng", async () => {
            const { schoolInitials, ...details } = adminDetails(5);
            const r = await run(superAdmin.registerSuperAdmin, { body: details });
            return r.body.message.match(/password is: (\S+)/)?.[1];
        }],
        ["accepting an invitation", "owner6@greenhill.ng", async () => {
            const { schoolInitials, ...details } = adminDetails(6);
            mockInvitation.value = details;
            const r = await run(superAdmin.acceptApplication, { params: { signature: "s" } });
            return r.body.message.match(/password is: (\S+)/)?.[1];
        }],
        ["an admin resetting staff", "tunde.bello@greenhill.ng", async () => {
            const doc = await staffDoc();
            const r = await run(staff.resetStaffPassword, { ...asSchool(doc.schoolId), params: { id: doc.id } });
            return r.body.data.newPassword;
        }],
        ["an admin resetting a student", "tobe.adeyemi@example.com", async () => {
            const doc = await studentDoc();
            const r = await run(students.resetStudentPassword, { ...asSchool(doc.schoolId), params: { id: doc.id } });
            return r.body.data.newPassword;
        }],
        ["an admin resetting a parent", parentDetails.email, async () => {
            const doc = await parentDoc();
            const r = await run(parents.resetParentPassword, { ...asSchool(doc.schoolId), params: { id: doc.id } });
            return r.body.data.newPassword;
        }],
    ];

    test.each(paths)("%s: an identifier from the generator is thrown away", async (_name, identifier, go) => {
        mockNextPasswords.push(identifier.toUpperCase(), AFTER);
        expect(await go()).toBe(AFTER);
        expect(mockNextPasswords).toEqual([]);
    });
});

describe("the paths that edit an account can't set a password", () => {
    test.each([
        ["an admin editing a student", studentDoc, (doc) => run(students.editStudent, { ...asSchool(doc.schoolId), params: { id: doc.id }, body: { firstName: "Tobi", password: "GH/2026/0042" } })],
        ["an admin editing a parent", parentDoc, (doc) => run(parents.updateParent, { ...asSchool(doc.schoolId), params: { id: doc.id }, body: { firstName: "Ada", password: "adaeze.obi@example.com" } })],
        ["an admin editing staff", staffDoc, (doc) => run(staff.adminUpdateStaff, { ...asSchool(doc.schoolId), params: { id: doc.id }, body: { firstName: "Tunde", password: "GH/S1234" } })],
        ["staff editing themselves", staffDoc, (doc) => run(staff.updateStaff, { user: { id: doc.id, schoolId: doc.schoolId }, params: { id: doc.id }, body: { firstName: "Tunde", password: "GH/S1234" } })],
        ["a super admin editing their profile", adminDoc, (doc) => run(superAdmin.updateProfile, { ...asSchool(doc._id), protocol: "https", get: () => "api.test", body: { firstName: "Bisi", password: "owner@greenhill.ng" } })],
    ])("%s", async (_name, make, edit) => {
        const doc = await make();
        const before = await stored(doc);
        await edit(doc);
        expect(await stored(doc)).toBe(before);
    });
});
