// What each flow emails, and that a failed send never fails the flow. Whether
// a send can throw is sendEmail.test.js's business: these use what it returns.
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || "1h";

jest.mock("../utils/sendEmail", () => jest.fn());
jest.mock("../utils/sendNotificationFallback", () => jest.fn());
const mockInvitation = { value: undefined };
jest.mock("node-cache", () => function FakeCache() {
    return { take: () => mockInvitation.value, set() {}, get() {} };
});

const M = require("../models");
const sendEmail = require("../utils/sendEmail");
const fallback = require("../utils/sendNotificationFallback");
const staff = require("../controller/staff");
const parents = require("../controller/parent");
const students = require("../controller/student");
const superAdmin = require("../controller/superAdmin");
const passwords = require("../controller/passwords");
const sessions = require("../controller/session");
const grades = require("../controller/grade");
const classes = require("../controller/class");
const { useTestDatabase } = require("./helpers/db");
const { run, asSchool } = require("./helpers/http");
const f = require("./helpers/factories");

useTestDatabase();

const settle = () => new Promise((r) => setTimeout(r, 0));
const mailed = () => [...sendEmail.mock.calls, ...fallback.mock.calls];
const delivery = (works) => {
    sendEmail.mockResolvedValue(works ? { status: true, message: "sent" } : { status: false, message: "not sent" });
    fallback.mockResolvedValue(works);
};

beforeEach(() => {
    jest.clearAllMocks();
    delivery(true);
    for (const m of ["log", "error"]) jest.spyOn(console, m).mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

async function school() {
    const id = f.id();
    await M.SuperAdminModel.collection.insertOne({
        _id: id, firstName: "Bisi", lastName: "Ade", emailAddress: `owner${id}@greenhill.ng`,
        schoolName: "Green Hill", schoolInitials: "GH",
    });
    return id;
}
const address = { number: 4, street: "Allen Avenue", city: "Ikeja", state: "Lagos", postalCode: "100001", country: "Nigeria" };
const parentDetails = {
    title: "Mrs", firstName: "Ada", surName: "Obi", gender: "female", maritalStatus: "married",
    email: "ada@example.com", phoneNumber: "08030000001", occupation: "Trader", country: "Nigeria", address,
};
const studentDetails = (arm) => ({
    classArmId: String(arm._id), firstName: "Tobi", surName: "Obi", gender: "male", dateOfBirth: "2014-03-02",
    country: "Nigeria", stateOfOrigin: "Lagos", localGovernmentArea: "Ikeja", email: "tobi@example.com",
    address: { street: "Allen Avenue", city: "Ikeja", state: "Lagos", country: "Nigeria" },
});
const adminDetails = (emailAddress) => ({
    firstName: "Bisi", lastName: "Ade", emailAddress, phoneNumber: "08030000000",
    schoolName: `School ${emailAddress}`, schoolEmailAddress: `school.${emailAddress}`,
    schoolAddress: { number: 4, street: "Allen Avenue", city: "Ikeja", state: "Lagos", country: "Nigeria" },
});
const staffDoc = (schoolId, more = {}) => M.staffModel.create({
    schoolId, firstName: "Tunde", surname: "Bello", emailAddress: "tunde@greenhill.ng", staffType: "academic", password: "old-hash", ...more,
});

describe("initial passwords are shown, never emailed", () => {
    test("a new staff member", async () => {
        const schoolId = await school();
        const r = await run(staff.createStaff, { ...asSchool(schoolId), body: { firstName: "Tunde", surname: "Bello", emailAddress: "tunde@greenhill.ng" } });
        expect(r.status).toBe(201);
        expect(r.body.data.temporaryPassword).toBeTruthy();
        expect(r.body.message).toBe("Staff created successfully");
        expect(mailed()).toEqual([]);
    });

    test("a new parent", async () => {
        const r = await run(parents.createParent, { ...asSchool(await school()), body: { ...parentDetails } });
        expect(r.status).toBe(201);
        expect(mailed()).toEqual([]);
    });

    test("a new student, with a new parent", async () => {
        const schoolId = await school();
        const arm = await f.classArm(schoolId);
        const r = await run(students.registerStudent, {
            ...asSchool(schoolId),
            body: {
                ...studentDetails(arm), parentTitle: "Mrs", parentFirstName: "Ada", parentSurName: "Obi", parentGender: "female",
                maritalStatus: "married", parentEmail: "ada@example.com", parentPhoneNumber: "08030000001", parentCountry: "Nigeria",
                occupation: "Trader", parentAddress: address, relationship: "Mother",
            },
        });
        expect(r.status).toBe(201);
        expect(r.body.initialPassword).toBeTruthy();
        expect(r.body.parentInitialPassword).toBeTruthy();
        expect(mailed()).toEqual([]);
    });
});

test("a reset code is emailed, to the account that asked", async () => {
    const schoolId = await school();
    await staffDoc(schoolId);
    await run(passwords.forgotPassword, { body: { email: "tunde@greenhill.ng" } });
    await settle();
    expect(mailed()).toHaveLength(1);
    const [to, , text] = mailed()[0];
    expect(to).toBe("tunde@greenhill.ng");
    expect(text).toMatch(/\b\d{6}\b/);
    // Retried, and not held back by a pause: it's the only way back in
    expect(fallback.mock.calls[0][4]).toEqual({ urgent: true });
});

describe.each([["delivered", true], ["not delivered", false]])("whatever triggered it stands when the email is %s", (_name, works) => {
    beforeEach(() => delivery(works));

    test("promoting and demoting an admin", async () => {
        const schoolId = await school();
        const doc = await staffDoc(schoolId);
        const made = await run(staff.makeAdmin, { ...asSchool(schoolId), params: { id: String(doc._id) } });
        expect(made.status).toBe(200);
        expect((await M.staffModel.findById(doc._id)).isAdmin).toBe(true);
        const removed = await run(staff.removeAdmin, { ...asSchool(schoolId), params: { id: String(doc._id) } });
        expect(removed.status).toBe(200);
        expect((await M.staffModel.findById(doc._id)).isAdmin).toBe(false);
    });

    test("assigning a class teacher", async () => {
        const schoolId = await school();
        const doc = await staffDoc(schoolId);
        const arm = await f.classArm(schoolId);
        const r = await run(classes.assignTeacherToClass, {
            ...asSchool(schoolId), params: { classArmId: String(arm._id), staffId: String(doc._id) },
        });
        expect(r.status).toBe(200);
        expect(String((await M.classArmModel.findById(arm._id)).assignedTeacher)).toBe(String(doc._id));
    });

    test("creating a session", async () => {
        const schoolId = await school();
        const r = await run(sessions.createSession, {
            ...asSchool(schoolId),
            body: { sessionName: "2030/2031", term: [{ termName: "First Term", termStartDate: "2030-09-10", termEndDate: "2030-12-15" }] },
        });
        expect(r.status).toBe(201);
    });

    test("creating a grade system", async () => {
        const schoolId = await school();
        const r = await run(grades.createGrade, {
            ...asSchool(schoolId),
            body: { name: "Standard", grades: [{ scoreRange: { from: 70, to: 100 }, grade: "A", remark: "Excellent", color: "green" }] },
        });
        expect(r.status).toBe(201);
    });

    test("a school signing up", async () => {
        const r = await run(superAdmin.registerSuperAdmin, { body: adminDetails(`signup${works}@greenhill.ng`) });
        expect(r.status).toBe(200);
        expect(await M.SuperAdminModel.countDocuments({ emailAddress: `signup${works}@greenhill.ng` })).toBe(1);
    });

    test("accepting an invitation", async () => {
        mockInvitation.value = adminDetails(`invited${works}@greenhill.ng`);
        const r = await run(superAdmin.acceptApplication, { params: { signature: "s" } });
        expect(r.status).toBe(200);
        expect(await M.SuperAdminModel.countDocuments({ emailAddress: `invited${works}@greenhill.ng` })).toBe(1);
    });

    test.each([
        ["staff", async (id) => run(staff.resetStaffPassword, { ...asSchool(id), params: { id: String((await staffDoc(id))._id) } })],
        ["student", async (id) => {
            const doc = await f.student(id, (await f.classArm(id))._id, { email: "tobi@example.com" });
            return run(students.resetStudentPassword, { ...asSchool(id), params: { id: String(doc._id) } });
        }],
        ["parent", async (id) => {
            const doc = await M.parentModel.create({ ...parentDetails, schoolId: id, password: "old-hash" });
            return run(parents.resetParentPassword, { ...asSchool(id), params: { id: String(doc._id) } });
        }],
    ])("an admin resetting a %s's password", async (_who, reset) => {
        const r = await reset(await school());
        expect(r.status).toBe(200);
        expect(r.body.data.newPassword).toBeTruthy();
    });

    test("asking for a reset code answers the same", async () => {
        const schoolId = await school();
        await staffDoc(schoolId);
        const r = await run(passwords.forgotPassword, { body: { email: "tunde@greenhill.ng" } });
        await settle();
        expect(r.status).toBe(200);
    });
});

test("accepting an invitation with the email undelivered still hands over the password", async () => {
    delivery(false);
    mockInvitation.value = adminDetails("undelivered@greenhill.ng");
    const r = await run(superAdmin.acceptApplication, { params: { signature: "s" } });
    expect(r.body.message).toMatch(/temporary password is: \S+/);
});
