// The one sender. Off unless switched on, the provider is configuration, and
// nothing it does can fail the operation that called it.
const mockSendMail = jest.fn();
const mockCreateTransport = jest.fn(() => ({ sendMail: mockSendMail }));
jest.mock("nodemailer", () => ({ createTransport: mockCreateTransport }));
const mockSgSend = jest.fn();
const mockSetApiKey = jest.fn();
jest.mock("@sendgrid/mail", () => ({ setApiKey: mockSetApiKey, send: mockSgSend }));

const sendEmail = require("../utils/sendEmail");
const { emailStatus } = sendEmail;

const SETTINGS = ["EMAIL_ENABLED", "EMAIL_PROVIDER", "EMAIL_SERVICE", "EMAIL_HOST", "FROM_EMAIL", "FROM_PASSWORD", "FROM_SENDER", "SENDGRID_API_KEY"];
const saved = Object.fromEntries(SETTINGS.map((k) => [k, process.env[k]]));
const GMAIL = { EMAIL_ENABLED: "true", EMAIL_SERVICE: "gmail", FROM_EMAIL: "school@gmail.com", FROM_PASSWORD: "app-password-value", FROM_SENDER: "Green Hill" };
const configure = (values) => { for (const k of SETTINGS) delete process.env[k]; Object.assign(process.env, values); };

let lines;
beforeEach(() => {
    lines = [];
    jest.clearAllMocks();
    mockSendMail.mockResolvedValue({ messageId: "1" });
    mockSgSend.mockResolvedValue([{ statusCode: 202 }]);
    for (const m of ["log", "error"]) jest.spyOn(console, m).mockImplementation((...a) => lines.push(a.join(" ")));
});
afterEach(() => {
    for (const k of SETTINGS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    jest.restoreAllMocks();
});
const send = () => sendEmail("a@example.com", "Password reset code", "Your code is 654321", "<p>Your code is 654321</p>");
const nothingAttempted = () => {
    expect(mockCreateTransport).not.toHaveBeenCalled();
    expect(mockSendMail).not.toHaveBeenCalled();
    expect(mockSgSend).not.toHaveBeenCalled();
};

describe("EMAIL_ENABLED", () => {
    test.each([["unset", undefined], ["empty", ""], ["false", "false"], ["0", "0"], ["1", "1"], ["on", "on"], ["yes", "yes"], ["truthy-looking", "true please"]])(
        "%s: off, whatever else is configured", async (_name, value) => {
            configure(GMAIL);
            if (value === undefined) delete process.env.EMAIL_ENABLED; else process.env.EMAIL_ENABLED = value;
            expect(await send()).toMatchObject({ status: false, skipped: true });
            nothingAttempted();
            expect(emailStatus()).toMatch(/^Email is off/);
        });

    test.each(["true", "TRUE", " true "])("%j: on", async (value) => {
        configure({ ...GMAIL, EMAIL_ENABLED: value });
        expect((await send()).status).toBe(true);
    });

    test("read on each send, so it can't be read before the environment has loaded", async () => {
        configure({ ...GMAIL, EMAIL_ENABLED: "false" });
        expect((await send()).status).toBe(false);
        process.env.EMAIL_ENABLED = "true";
        expect((await send()).status).toBe(true);
    });
});

describe("through nodemailer", () => {
    test("is what an unset EMAIL_PROVIDER means, and sends the whole message from the configured account", async () => {
        configure(GMAIL);
        expect(await send()).toMatchObject({ status: true });
        expect(mockCreateTransport.mock.calls[0][0]).toMatchObject({
            service: "gmail", auth: { user: "school@gmail.com", pass: "app-password-value" },
        });
        expect(mockSendMail.mock.calls[0][0]).toEqual({
            from: { name: "Green Hill", address: "school@gmail.com" },
            to: "a@example.com", subject: "Password reset code",
            text: "Your code is 654321", html: "<p>Your code is 654321</p>",
        });
        expect(mockSgSend).not.toHaveBeenCalled();
    });

    test("doesn't wait minutes on a blocked connection", async () => {
        configure(GMAIL);
        await send();
        const { connectionTimeout, greetingTimeout, socketTimeout } = mockCreateTransport.mock.calls[0][0];
        expect(Math.max(connectionTimeout, greetingTimeout, socketTimeout)).toBeLessThanOrEqual(20000);
    });

    test("always has an address to send from: FROM_SENDER is only a name", async () => {
        configure({ ...GMAIL, FROM_SENDER: "Green Hill <other@example.com>" });
        await send();
        expect(mockSendMail.mock.calls[0][0].from).toEqual({ name: "Green Hill", address: "school@gmail.com" });
        delete process.env.FROM_SENDER;
        await send();
        expect(mockSendMail.mock.calls[1][0].from).toEqual({ name: undefined, address: "school@gmail.com" });
    });

    test.each(["EMAIL_SERVICE", "FROM_EMAIL", "FROM_PASSWORD"])("without %s: names it and attempts nothing", async (name) => {
        configure(GMAIL);
        delete process.env[name];
        expect(await send()).toMatchObject({ status: false, skipped: true });
        nothingAttempted();
        expect(lines.join()).toContain(name);
    });

    test("EMAIL_HOST can stand in for EMAIL_SERVICE", async () => {
        configure({ ...GMAIL, EMAIL_SERVICE: "", EMAIL_HOST: "smtp.example.com" });
        expect((await send()).status).toBe(true);
    });
});

describe("through SendGrid", () => {
    const SENDGRID = { EMAIL_ENABLED: "true", EMAIL_PROVIDER: "sendgrid", SENDGRID_API_KEY: "SG.key-value", FROM_EMAIL: "school@example.com", FROM_SENDER: "Green Hill" };

    test("moving is configuration: the same call, the other provider", async () => {
        configure(SENDGRID);
        expect(await send()).toMatchObject({ status: true });
        expect(mockSetApiKey).toHaveBeenCalledWith("SG.key-value");
        expect(mockSgSend.mock.calls[0][0]).toEqual({
            from: { name: "Green Hill", email: "school@example.com" },
            to: "a@example.com", subject: "Password reset code",
            text: "Your code is 654321", html: "<p>Your code is 654321</p>",
        });
        expect(mockSendMail).not.toHaveBeenCalled();
    });

    test.each(["SENDGRID_API_KEY", "FROM_EMAIL"])("without %s: names it and attempts nothing", async (name) => {
        configure(SENDGRID);
        delete process.env[name];
        expect(await send()).toMatchObject({ status: false, skipped: true });
        nothingAttempted();
        expect(lines.join()).toContain(name);
    });
});

test("an unknown provider attempts nothing and says what to use", async () => {
    configure({ ...GMAIL, EMAIL_PROVIDER: "mailgun" });
    expect(await send()).toMatchObject({ status: false, skipped: true });
    nothingAttempted();
    expect(emailStatus()).toContain("nodemailer or sendgrid");
});

test("no recipient attempts nothing", async () => {
    configure(GMAIL);
    expect(await sendEmail(undefined, "Subject", "text", "<p>text</p>")).toMatchObject({ status: false, skipped: true });
    nothingAttempted();
});

describe("a send that fails", () => {
    test.each([
        ["sending", () => mockSendMail.mockRejectedValueOnce(new Error("Invalid login"))],
        ["building the transport", () => mockCreateTransport.mockImplementationOnce(() => { throw new Error("bad options"); })],
    ])("%s: reports it rather than throwing, and it can be retried", async (_name, breakIt) => {
        configure(GMAIL);
        breakIt();
        const r = await send();
        expect(r.status).toBe(false);
        expect(r.skipped).toBeUndefined();
    });

    test("logs why, but never the body or the password", async () => {
        configure(GMAIL);
        mockSendMail.mockRejectedValueOnce(new Error("Invalid login"));
        await send();
        expect(lines.join()).toContain("Invalid login");
        expect(lines.join()).not.toContain("654321");
        expect(lines.join()).not.toContain("app-password-value");
    });
});

describe("what a refusal means, so the caller knows whether to retry", () => {
    const refusal = (fields) => Object.assign(new Error("refused"), fields);
    test.each([
        ["a dropped connection", { code: "ETIMEDOUT" }, { retryable: true, recipientFault: false }],
        ["SMTP busy (421)", { code: "ECONNECTION", responseCode: 421 }, { retryable: true, recipientFault: false }],
        ["SendGrid unavailable (503)", { code: 503 }, { retryable: true, recipientFault: false }],
        ["a wrong Gmail password", { code: "EAUTH", responseCode: 535 }, { retryable: false, recipientFault: false }],
        ["credentials nodemailer refuses before asking", { code: "EAUTH" }, { retryable: false, recipientFault: false }],
        ["Gmail's daily limit (550)", { code: "EMESSAGE", responseCode: 550 }, { retryable: false, recipientFault: false }],
        ["a wrong SendGrid key", { code: 401 }, { retryable: false, recipientFault: false }],
        ["a SendGrid sender not verified", { code: 403 }, { retryable: false, recipientFault: false }],
        ["a refused address", { code: "EENVELOPE", responseCode: 550 }, { retryable: false, recipientFault: true }],
        ["a request SendGrid won't take", { code: 400 }, { retryable: false, recipientFault: true }],
    ])("%s", async (_name, fields, expected) => {
        configure(GMAIL);
        mockSendMail.mockRejectedValueOnce(refusal(fields));
        expect(await send()).toMatchObject({ status: false, ...expected });
    });
});

test("the startup line says what's on, and no setting's value", () => {
    configure(GMAIL);
    expect(emailStatus()).toBe("Email is on through nodemailer");
    delete process.env.FROM_PASSWORD;
    expect(emailStatus()).toBe("Email is on through nodemailer, but FROM_PASSWORD isn't set");
});

test("with email off, the body doesn't reach the log either", async () => {
    configure({});
    await send();
    expect(lines.join()).toContain("Password reset code");
    expect(lines.join()).not.toContain("654321");
});
