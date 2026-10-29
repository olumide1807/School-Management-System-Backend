// Forgot password → verify OTP → reset password (super admins and staff).
//
// Verifying the OTP spends it and issues a single-use reset token, returned
// only to whoever verified and stored only as a hash. Resetting takes that
// token and nothing else: knowing someone's email is never enough.
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || "1h";

// Email isn't configured; the OTP goes to the console, as in production today
jest.mock("../utils/sendgrid", () => jest.fn(async () => ({ status: false, message: "not sent" })));

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const M = require("../models");
const passwords = require("../controller/passwords");
const { staffLogin } = require("../controller/auth");
const { useTestDatabase } = require("./helpers/db");
const { run } = require("./helpers/http");
const f = require("./helpers/factories");

useTestDatabase();

let logged = [];
beforeEach(() => {
    logged = [];
    jest.spyOn(console, "log").mockImplementation((...a) => logged.push(a.join(" ")));
    jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const EMAIL = "tunde@greenhill.ng";
async function staffMember(email = EMAIL) {
    return M.staffModel.create({
        schoolId: f.id(), firstName: "Tunde", surname: "Bello", emailAddress: email, staffType: "academic",
        password: await bcrypt.hash("old-password", 4),
    });
}
const forgot = (email = EMAIL) => run(passwords.forgotPassword, { body: { email } });
const lastOtp = (email = EMAIL) => {
    const re = new RegExp(`\\[DEV\\] OTP for ${email.replace(/\./g, "\\.")}: (\\d+)`);
    const hits = logged.map((l) => l.match(re)).filter(Boolean);
    return hits.length ? hits[hits.length - 1][1] : undefined;
};
const verify = (otp, email = EMAIL) => run(passwords.verifyOTP, { body: { otp: Number(otp) }, query: { email } });
const reset = (body, query = {}) => run(passwords.resetPassword, { body, query });
const login = (password, email = EMAIL) => run(staffLogin, { body: { email, password } });

async function verified(email = EMAIL) {
    await forgot(email);
    const v = await verify(lastOtp(email), email);
    expect(v.status).toBe(200);
    return v.body.data.resetToken;
}

describe("verifying issues a single-use reset token", () => {
    test("the whole flow: the token sets the new password", async () => {
        await staffMember();
        const token = await verified();
        expect(token).toMatch(/^[0-9a-f]{64}$/);
        expect((await reset({ token, password: "a-new-password" })).status).toBe(200);
        expect((await login("a-new-password")).status).toBe(200);
        expect((await login("old-password")).status).toBe(401);
    });

    test("only a hash of the token is stored", async () => {
        const doc = await staffMember();
        const token = await verified();
        const raw = await M.staffModel.collection.findOne({ _id: doc._id });
        expect(raw.resetPasswordToken).not.toBe(token);
        expect(raw.resetPasswordToken).toBe(crypto.createHash("sha256").update(token).digest("hex"));
    });

    test("an OTP can't be verified twice", async () => {
        await staffMember();
        await forgot();
        const otp = lastOtp();
        expect((await verify(otp)).status).toBe(200);
        expect((await verify(otp)).status).not.toBe(200);
    });
});

describe("resetting needs the token, and nothing else will do", () => {
    test("during someone's reset, their email alone can't set the password", async () => {
        await staffMember();
        await verified(); // the account holder has verified; their window is open
        // The old request: email in the query, no token
        expect((await reset({ password: "attacker-pass" }, { email: EMAIL })).status).toBe(400);
        // A made-up token, with the email
        expect((await reset({ token: "a".repeat(64), password: "attacker-pass" }, { email: EMAIL })).status).toBe(400);
        expect((await login("attacker-pass")).status).toBe(401);
        expect((await login("old-password")).status).toBe(200);
    });

    test("a request without a token is refused before anything is looked up", async () => {
        await staffMember();
        expect(await reset({ password: "attacker-pass" })).toEqual({ status: 400, body: { success: false, error: '"token" is required' } });
    });

    test("a token works once", async () => {
        await staffMember();
        const token = await verified();
        expect((await reset({ token, password: "first-new-pass" })).status).toBe(200);
        const again = await reset({ token, password: "second-new-pass" });
        expect(again).toEqual({ status: 400, body: { success: false, error: "This reset link has expired or has already been used. Request a new code to start again." } });
        expect((await login("first-new-pass")).status).toBe(200);
    });

    test("two resets racing with the same token: exactly one wins", async () => {
        await staffMember();
        const token = await verified();
        const results = await Promise.all([
            reset({ token, password: "racer-one-pass" }),
            reset({ token, password: "racer-two-pass" }),
        ]);
        expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    });

    test("an expired token ends the window", async () => {
        const doc = await staffMember();
        const token = await verified();
        await M.staffModel.collection.updateOne({ _id: doc._id }, { $set: { resetPasswordExpire: new Date(Date.now() - 1000) } });
        expect((await reset({ token, password: "too-late-pass" })).status).toBe(400);
        expect((await login("old-password")).status).toBe(200);
    });

    test("one account's token can't reset another account", async () => {
        await staffMember();
        await staffMember("kemi@greenhill.ng");
        const token = await verified();
        expect((await reset({ token, password: "a-new-password" })).status).toBe(200);
        expect((await login("old-password", "kemi@greenhill.ng")).status).toBe(200);
    });
});
