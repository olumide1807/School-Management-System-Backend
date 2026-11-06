// A student's first password is random and returned once. It used to be their
// student ID: printed on ID cards and shown in every class list, so any student
// could sign in as a classmate, and whoever signed in first set the new
// password, locking the real student out.
//
// There's no bulk endpoint. A CSV upload sends one POST /student/register per
// row, so what's returned here is what every bulk row gets.
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || "1h";

const bcrypt = require("bcryptjs");
const M = require("../models");
const students = require("../controller/student");
const { studentLogin } = require("../controller/auth");
const { parentLogin } = require("../controller/auth");
const { ALPHABET, LENGTH } = require("../utils/generatePortalPassword");
const { useTestDatabase } = require("./helpers/db");
const { run, asSchool } = require("./helpers/http");
const f = require("./helpers/factories");

useTestDatabase();

beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

async function school() {
    const id = f.id();
    await M.SuperAdminModel.collection.insertOne({ _id: id, schoolName: "Green Hill", schoolInitials: "GH" });
    const arm = await f.classArm(id);
    return { id, arm };
}
const details = (w, more = {}) => ({
    classArmId: String(w.arm._id), firstName: "Tobi", surName: "Obi", gender: "male", dateOfBirth: "2014-03-02",
    country: "Nigeria", stateOfOrigin: "Lagos", localGovernmentArea: "Ikeja",
    address: { street: "Allen Avenue", city: "Ikeja", state: "Lagos", country: "Nigeria" },
    ...more,
});
const withNewParent = {
    parentTitle: "Mrs", parentFirstName: "Ada", parentSurName: "Obi", parentGender: "female", maritalStatus: "married",
    parentEmail: "ada@example.com", parentPhoneNumber: "08030000001", parentCountry: "Nigeria", occupation: "Trader",
    parentAddress: { number: 4, street: "Allen Avenue", city: "Ikeja", state: "Lagos", postalCode: "100001", country: "Nigeria" },
    relationship: "Mother",
};
const register = (w, more) => run(students.registerStudent, { ...asSchool(w.id), body: details(w, more) });
const signIn = (studentID, password) => run(studentLogin, { body: { studentID, password } });

describe("a new student's password", () => {
    test("is returned, and is what they sign in with", async () => {
        const w = await school();
        const r = await register(w);
        expect(r.status).toBe(201);
        const { initialPassword } = r.body;
        const id = r.body.data.student.studentID;
        const login = await signIn(id, initialPassword);
        expect(login.status).toBe(200);
        expect(login.body.mustChangePassword).toBe(true);
    });

    test("isn't their student ID: the ID no longer signs them in", async () => {
        const w = await school();
        const r = await register(w);
        const id = r.body.data.student.studentID;
        expect(r.body.initialPassword).not.toBe(id);
        expect(await signIn(id, id)).toEqual({ status: 401, body: { success: false, error: "Invalid credentials" } });
    });

    test("comes from the shared generator, and differs per student", async () => {
        const w = await school();
        const a = (await register(w)).body.initialPassword;
        const b = (await register(w)).body.initialPassword;
        for (const p of [a, b]) {
            expect(p).toHaveLength(LENGTH);
            expect([...p].every((c) => ALPHABET.includes(c))).toBe(true);
        }
        expect(a).not.toBe(b);
    });

    test("is stored only as a hash, and the hash isn't returned", async () => {
        const w = await school();
        const r = await register(w);
        const raw = await M.studentModel.collection.findOne({ _id: r.body.data.student._id });
        expect(raw.password).not.toBe(r.body.initialPassword);
        expect(await bcrypt.compare(r.body.initialPassword, raw.password)).toBe(true);
        expect(r.body.data.student).not.toHaveProperty("password");
    });

    test("every row of a bulk upload gets its own working password", async () => {
        const w = await school();
        const rows = [];
        for (const firstName of ["Ada", "Bola", "Chidi", "Dayo", "Efe"]) rows.push(await register(w, { firstName }));
        const passwords = rows.map((r) => r.body.initialPassword);
        expect(new Set(passwords).size).toBe(5);
        for (const r of rows) {
            expect((await signIn(r.body.data.student.studentID, r.body.initialPassword)).status).toBe(200);
        }
    });

    test("a failed registration returns no password", async () => {
        const w = await school();
        const r = await register(w, { classArmId: String(f.id()) });
        expect(r.status).toBe(404);
        expect(r.body).not.toHaveProperty("initialPassword");
    });
});

describe("with a new parent", () => {
    test("student and parent each get their own password, under their own name", async () => {
        const w = await school();
        const r = await register(w, withNewParent);
        const { initialPassword, parentInitialPassword } = r.body;
        expect(initialPassword).not.toBe(parentInitialPassword);
        expect((await signIn(r.body.data.student.studentID, initialPassword)).status).toBe(200);
        expect((await run(parentLogin, { body: { email: "ada@example.com", password: parentInitialPassword } })).status).toBe(200);
        expect((await run(parentLogin, { body: { email: "ada@example.com", password: initialPassword } })).status).toBe(401);
    });

    test("no new parent: parentInitialPassword stays null", async () => {
        const w = await school();
        const r = await register(w);
        expect(r.body.parentInitialPassword).toBeNull();
    });
});

// Deliberately not migrated: changing them would lock out every student who is
// signing in with their ID today
test("a student registered before this keeps their password, which is still their ID", async () => {
    const w = await school();
    await f.student(w.id, w.arm._id, { studentID: "GH/1001", password: await bcrypt.hash("GH/1001", 4) });
    expect((await signIn("GH/1001", "GH/1001")).status).toBe(200);
});
