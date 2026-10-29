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
// The email (and, with email unconfigured, the console line carrying the
// code) goes out after the response; let it finish before reading the code
const settle = () => new Promise((r) => setTimeout(r, 0));
const forgot = async (email = EMAIL) => {
    const r = await run(passwords.forgotPassword, { body: { email } });
    await settle();
    return r;
};
const otpsLogged = (email = EMAIL) => logged.filter((l) => l.includes(`[DEV] OTP for ${email}:`)).length;
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

describe("OTPs resist guessing", () => {
    const wrong = (otp) => String(Number(otp) === 999999 ? 100000 : Number(otp) + 1);
    const otpState = (id) => M.staffModel.collection.findOne({ _id: id });

    test("a code is six digits and stored only as a hash", async () => {
        const doc = await staffMember();
        await forgot();
        const otp = lastOtp();
        expect(otp).toMatch(/^[1-9]\d{5}$/);
        const raw = await otpState(doc._id);
        expect(raw.resetOtpHash).toEqual(expect.any(String));
        expect(raw.resetOtpHash).not.toContain(otp);
    });

    test("wrong guesses count down, and the fifth kills the code — even the right one fails after", async () => {
        await staffMember();
        await forgot();
        const otp = lastOtp();
        const answers = [];
        for (let i = 0; i < 5; i++) answers.push((await verify(wrong(otp))).body.error);
        expect(answers).toEqual([
            "That code isn't right. 4 attempts left.",
            "That code isn't right. 3 attempts left.",
            "That code isn't right. 2 attempts left.",
            "That code isn't right. 1 attempt left.",
            "Too many wrong codes. Request a new code.",
        ]);
        const late = await verify(otp);
        expect(late.status).toBe(400);
        expect(late.body.error).toMatch(/^There's no valid code for this account/);
    });

    test("parallel guesses can't get more than five tries between them", async () => {
        const doc = await staffMember();
        await forgot();
        const otp = lastOtp();
        const results = await Promise.all(Array.from({ length: 20 }, () => verify(wrong(otp))));
        const counted = results.filter((r) => /That code isn't right|Too many wrong codes/.test(r.body.error));
        expect(counted.length).toBe(5);
        expect((await verify(otp)).status).toBe(400);
        expect((await otpState(doc._id)).resetOtpHash).toBeUndefined();
    });

    test("a code expires after ten minutes", async () => {
        const doc = await staffMember();
        await forgot();
        await M.staffModel.collection.updateOne({ _id: doc._id }, { $set: { resetOtpExpire: new Date(Date.now() - 1000) } });
        expect((await verify(lastOtp())).status).toBe(400);
    });

    test("a new code replaces the old one", async () => {
        await staffMember();
        await forgot();
        const first = lastOtp();
        await forgot();
        const second = lastOtp();
        if (first !== second) expect((await verify(first)).status).toBe(400);
        expect((await verify(second)).status).toBe(200);
    });

    test("five codes per account per day; the sixth issues none, and other accounts aren't affected", async () => {
        await staffMember();
        await staffMember("kemi@greenhill.ng");
        for (let i = 0; i < 5; i++) expect((await forgot()).status).toBe(200);
        const fifthCode = lastOtp();
        const sixth = await forgot();
        // The same answer as ever (see "forgot-password doesn't reveal…"), but no code
        expect(sixth.status).toBe(200);
        expect(otpsLogged()).toBe(5);
        expect((await verify(fifthCode)).status).toBe(200);
        await forgot("kemi@greenhill.ng");
        expect(otpsLogged("kemi@greenhill.ng")).toBe(1);
    });

    test("parallel requests can't get past the daily limit", async () => {
        const doc = await staffMember();
        await Promise.all(Array.from({ length: 12 }, () => forgot()));
        expect(otpsLogged()).toBe(5);
        expect((await otpState(doc._id)).resetOtpRequests).toHaveLength(5);
    });

    test("the limit is a rolling 24 hours", async () => {
        const doc = await staffMember();
        const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000);
        await M.staffModel.collection.updateOne({ _id: doc._id }, { $set: { resetOtpRequests: Array(5).fill(yesterday) } });
        expect((await forgot()).status).toBe(200);
        expect((await otpState(doc._id)).resetOtpRequests).toHaveLength(1);
    });
});

describe("forgot-password doesn't reveal which emails have accounts", () => {
    const SENT = "If that email belongs to an account, a 6-digit code has been sent to it. It lasts 10 minutes, and you can request up to 5 codes a day.";

    test("an unknown email, a real one, and a real one over its daily limit get the same answer", async () => {
        await staffMember();
        const known = await forgot();
        const unknown = await forgot("nobody@example.com");
        for (let i = 0; i < 5; i++) await forgot();
        const limited = await forgot();
        expect(known).toEqual({ status: 200, body: { success: true, message: SENT, data: null } });
        expect(unknown).toEqual(known);
        expect(limited).toEqual(known);
        expect(otpsLogged("nobody@example.com")).toBe(0);
    });

    test("verifying for an unknown email gets the same answer as a real account with no code", async () => {
        await staffMember();
        const unknown = await verify("123456", "nobody@example.com");
        const noCode = await verify("123456");
        expect(unknown.status).toBe(400);
        expect(unknown).toEqual(noCode);
    });

    test("a request is answered exactly once", async () => {
        await staffMember();
        let answers = 0;
        const res = { status() { return this; }, cookie() { return this; }, json() { answers++; return this; } };
        await passwords.forgotPassword({ body: { email: EMAIL } }, res, (e) => { throw e; });
        await settle();
        expect(answers).toBe(1);
    });
});
