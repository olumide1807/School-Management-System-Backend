// The same send with retries, and a breaker that closes again. It used to
// count failures across all sends and never reset, so five in total stopped
// every email until the server restarted, and nothing said so.
jest.mock("../utils/sendEmail", () => jest.fn());

const WORKS = { status: true };
const DOWN = { status: false, message: "Connection timeout" };
const SIGN_IN_REFUSED = { status: false, retryable: false, message: "Invalid login" };
const BAD_ADDRESS = { status: false, recipientFault: true, retryable: false, message: "Address rejected" };
const NOT_ATTEMPTED = { status: false, skipped: true, message: "Email is off" };
const MINUTE = 60 * 1000;

let sendEmail, fallback, now, errors, logs;

// The breaker lives in the module, so each test loads a fresh copy
beforeEach(() => {
    jest.resetModules();
    sendEmail = require("../utils/sendEmail");
    fallback = require("../utils/sendNotificationFallback");
    now = 1000000;
    errors = [];
    logs = [];
    jest.spyOn(Date, "now").mockImplementation(() => now);
    jest.spyOn(console, "log").mockImplementation((...a) => logs.push(a.join(" ")));
    jest.spyOn(console, "error").mockImplementation((...a) => errors.push(a.join(" ")));
    // The retries wait five seconds each; don't, here
    jest.spyOn(global, "setTimeout").mockImplementation((fn) => { fn(); return 0; });
});
afterEach(() => jest.restoreAllMocks());
const send = (options) => fallback("a@example.com", "Subject", "Secret body", "<p>Secret body</p>", options);
const failSends = async (n) => {
    sendEmail.mockResolvedValue(DOWN);
    for (let i = 0; i < n; i++) await send();
};
const pause = () => failSends(3);
const attemptsDuring = async (fn) => {
    sendEmail.mockClear();
    await fn();
    return sendEmail.mock.calls.length;
};

describe("one send", () => {
    test("sends, passing everything on, and reports it", async () => {
        sendEmail.mockResolvedValue(WORKS);
        expect(await send()).toBe(true);
        expect(sendEmail).toHaveBeenCalledTimes(1);
        expect(sendEmail).toHaveBeenCalledWith("a@example.com", "Subject", "Secret body", "<p>Secret body</p>");
        expect(setTimeout).not.toHaveBeenCalled();
    });

    test("a transient failure is retried, and a retry can succeed", async () => {
        sendEmail.mockResolvedValueOnce(DOWN).mockResolvedValueOnce(WORKS);
        expect(await send()).toBe(true);
        expect(sendEmail).toHaveBeenCalledTimes(2);
    });

    test("gives up after three attempts, waiting between them but not after the last", async () => {
        sendEmail.mockResolvedValue(DOWN);
        expect(await send()).toBe(false);
        expect(sendEmail).toHaveBeenCalledTimes(3);
        expect(setTimeout).toHaveBeenCalledTimes(2);
    });

    test.each([["nothing was attempted", NOT_ATTEMPTED], ["the address was refused", BAD_ADDRESS], ["the sign-in was refused", SIGN_IN_REFUSED]])(
        "%s: no point retrying or waiting", async (_name, answer) => {
            sendEmail.mockResolvedValue(answer);
            expect(await send()).toBe(false);
            expect(sendEmail).toHaveBeenCalledTimes(1);
            expect(setTimeout).not.toHaveBeenCalled();
        });
});

describe("what doesn't pause email", () => {
    test("the bug: failures adding up over time. Each is forgotten after the window", async () => {
        for (let i = 0; i < 12; i++) {
            await failSends(1);
            now += 6 * MINUTE;
        }
        sendEmail.mockResolvedValue(WORKS);
        expect(await send()).toBe(true);
        expect(errors.join()).not.toContain("PAUSED");
    });

    test("a success clears the count", async () => {
        await failSends(2);
        sendEmail.mockResolvedValue(WORKS);
        await send();
        await failSends(2);
        expect(errors.join()).not.toContain("PAUSED");
        expect(await attemptsDuring(() => send())).toBeGreaterThan(0);
    });

    test("one bad address, however many times: it isn't the provider's fault", async () => {
        sendEmail.mockResolvedValue(BAD_ADDRESS);
        for (let i = 0; i < 10; i++) await send();
        sendEmail.mockResolvedValue(WORKS);
        expect(await send()).toBe(true);
        expect(errors.join()).not.toContain("PAUSED");
    });

    test("a bad address between failures counts as the provider answering", async () => {
        await failSends(2);
        sendEmail.mockResolvedValue(BAD_ADDRESS);
        await send();
        await failSends(2);
        expect(errors.join()).not.toContain("PAUSED");
    });

    test("email being off", async () => {
        sendEmail.mockResolvedValue(NOT_ATTEMPTED);
        for (let i = 0; i < 10; i++) await send();
        expect(errors.join()).not.toContain("PAUSED");
        expect(await attemptsDuring(() => send())).toBe(1);
    });
});

describe("when several sends fail close together", () => {
    test("says so loudly, once, with why, when it ends, and no message body", async () => {
        await failSends(2);
        expect(errors).toEqual([]);
        await failSends(1);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain("EMAIL IS PAUSED");
        expect(errors[0]).toContain("Connection timeout");
        expect(errors[0]).toContain(new Date(now + 5 * MINUTE).toISOString());
        expect(errors[0]).not.toContain("Secret body");
    });

    test("refused sign-ins count, since nothing will send until they're fixed", async () => {
        sendEmail.mockResolvedValue(SIGN_IN_REFUSED);
        for (let i = 0; i < 3; i++) await send();
        expect(errors.join()).toContain("EMAIL IS PAUSED");
    });

    test("later sends fail at once, without touching the provider, and each says it wasn't sent", async () => {
        await pause();
        expect(await attemptsDuring(async () => expect(await send()).toBe(false))).toBe(0);
        expect(setTimeout).toHaveBeenCalledTimes(6); // only the three failing sends' waits
        expect(errors.at(-1)).toContain('"Subject" wasn\'t sent');
    });

    test("it closes: after the pause the next send gets through and everything resumes", async () => {
        await pause();
        now += 5 * MINUTE;
        sendEmail.mockResolvedValue(WORKS);
        expect(await send()).toBe(true);
        expect(logs.join()).toContain("EMAIL IS BACK");
        expect(await attemptsDuring(() => send())).toBe(1);
    });

    test("still down: one attempt only, and it pauses again and says so", async () => {
        await pause();
        const said = errors.length;
        now += 5 * MINUTE;
        expect(await attemptsDuring(async () => expect(await send()).toBe(false))).toBe(1);
        expect(errors.length).toBe(said + 1);
        expect(errors.at(-1)).toContain("EMAIL IS PAUSED");
        expect(await attemptsDuring(() => send())).toBe(0);
        now += 5 * MINUTE;
        sendEmail.mockResolvedValue(WORKS);
        expect(await send()).toBe(true);
    });

    test("while one send is testing the provider, others don't pile on", async () => {
        await pause();
        now += 5 * MINUTE;
        let answer;
        sendEmail.mockClear();
        sendEmail.mockImplementation(() => new Promise((resolve) => { answer = resolve; }));
        const first = send();
        expect(await send()).toBe(false);
        expect(sendEmail).toHaveBeenCalledTimes(1);
        answer(WORKS);
        expect(await first).toBe(true);
    });
});

describe("urgent sends, which is reset codes", () => {
    test("are attempted while paused, with retries", async () => {
        await pause();
        sendEmail.mockResolvedValueOnce(DOWN).mockResolvedValueOnce(WORKS);
        expect(await send({ urgent: true })).toBe(true);
        expect(sendEmail).toHaveBeenCalledTimes(3 * 3 + 2);
    });

    test("getting through ends the pause for everyone", async () => {
        await pause();
        sendEmail.mockResolvedValue(WORKS);
        await send({ urgent: true });
        expect(logs.join()).toContain("EMAIL IS BACK");
        expect(await attemptsDuring(() => send())).toBe(1);
    });

    test("failing while paused keeps it paused", async () => {
        await pause();
        await send({ urgent: true });
        expect(await attemptsDuring(() => send())).toBe(0);
    });
});
