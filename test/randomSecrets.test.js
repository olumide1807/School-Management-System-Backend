// One-time passwords and generated super-admin passwords come from crypto,
// never Math.random. V8's Math.random is xorshift128+: its state can be
// recovered from a few outputs, so a Math.random OTP can be predicted —
// an authentication bypass, not a weak password.
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || "1h";

// SendGrid isn't configured: sending fails and the OTP goes to the console,
// as it does in production today. No network in tests.
jest.mock("../utils/sendgrid", () => jest.fn(async () => ({ status: false, message: "not sent" })));

const { generateRandomOTP } = require("../utils/generateRandomOTP");
const { ALPHABET, LENGTH } = require("../utils/generatePortalPassword");
const passwords = require("../controller/passwords");
const { registerSuperAdmin } = require("../controller/superAdmin");
const { useTestDatabase } = require("./helpers/db");
const { run } = require("./helpers/http");

useTestDatabase();

afterEach(() => jest.restoreAllMocks());

// Signs a school up through the real endpoint
let seq = 0;
const register = (emailAddress = `owner${++seq}@greenhill.ng`) => {
    const n = ++seq;
    return run(registerSuperAdmin, {
        body: {
            firstName: "Bisi", lastName: "Ade", emailAddress, phoneNumber: "08030000000",
            schoolName: `Green Hill ${n}`, schoolEmailAddress: `school${n}@greenhill.ng`,
            schoolAddress: { number: 4, street: "Allen Avenue", city: "Ikeja", state: "Lagos", country: "Nigeria" },
        },
    });
};

describe("generateRandomOTP", () => {
    test("is always six digits, 100000–999999 — what verifyOTP accepts", () => {
        for (let i = 0; i < 5000; i++) {
            const otp = generateRandomOTP();
            expect(Number.isInteger(otp)).toBe(true);
            expect(otp).toBeGreaterThanOrEqual(100000);
            expect(otp).toBeLessThanOrEqual(999999);
        }
    });

    test("doesn't come from Math.random: pinning it changes nothing", () => {
        jest.spyOn(Math, "random").mockReturnValue(0.5);
        const draws = new Set(Array.from({ length: 50 }, generateRandomOTP));
        expect(draws.size).toBeGreaterThan(40);
    });

    // Wrapping three bytes with % 900000 would make 100000–675999 come up
    // 65.2% of the time instead of 64%. Over 200,000 draws the spread is
    // about ±0.1%, so the bias would sit eleven standard deviations out.
    test("every value is equally likely — no modulo bias", () => {
        const N = 200000;
        let low = 0;
        for (let i = 0; i < N; i++) if (generateRandomOTP() < 676000) low++;
        expect(low / N).toBeGreaterThan(0.635);
        expect(low / N).toBeLessThan(0.645);
    });
});

describe("the forgot-password flow accepts the OTP it generates", () => {
    test("forgot → verify → reset, for a super admin", async () => {
        const logged = [];
        jest.spyOn(console, "log").mockImplementation((...a) => logged.push(a.join(" ")));
        jest.spyOn(console, "error").mockImplementation(() => {});
        // A complete account, made the way schools sign up
        expect((await register("owner@greenhill.ng")).status).toBe(200);

        const forgot = await run(passwords.forgotPassword, { body: { email: "owner@greenhill.ng" } });
        await new Promise((r) => setTimeout(r, 0)); // the email goes out after the response
        expect(forgot.status).toBe(200);
        const otp = logged.map((l) => l.match(/\[DEV\] OTP for owner@greenhill\.ng: (\d+)/)).find(Boolean)?.[1];
        expect(otp).toMatch(/^[1-9]\d{5}$/);

        // The user types it; it arrives as a number (Joi.number())
        const verify = await run(passwords.verifyOTP, { body: { otp: Number(otp) }, query: { email: "owner@greenhill.ng" } });
        expect(verify.status).toBe(200);
        const reset = await run(passwords.resetPassword, { body: { token: verify.body.data.resetToken, password: "a-new-password" } });
        expect(reset.status).toBe(200);
    });
});

describe("generated super-admin passwords", () => {
    const passwordIn = (r) => r.body.message.match(/temporary password is: (\S+)/)?.[1];

    test("come from the shared generator: its length and alphabet, and Math.random plays no part", async () => {
        jest.spyOn(console, "log").mockImplementation(() => {});
        jest.spyOn(Math, "random").mockReturnValue(0.5);
        const a = await register();
        const b = await register();
        expect(a.status).toBe(200);
        const [pa, pb] = [passwordIn(a), passwordIn(b)];
        for (const p of [pa, pb]) {
            expect(p).toHaveLength(LENGTH);
            expect([...p].every((c) => ALPHABET.includes(c))).toBe(true);
        }
        expect(pa).not.toBe(pb);
    });
});
