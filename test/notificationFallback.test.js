// With no SendGrid key a send can't succeed, so the retries were only making
// someone wait: about 25 seconds on the first staff member created.
jest.mock("../utils/sendgrid", () => jest.fn());

const saved = process.env.SENDGRID_API_KEY;
let sendEmail, fallback;

// The retry count lives in the module, so each test loads a fresh copy
beforeEach(() => {
    jest.resetModules();
    sendEmail = require("../utils/sendgrid");
    fallback = require("../utils/sendNotificationFallback");
    jest.spyOn(console, "log").mockImplementation(() => {});
    // The retries wait five seconds each; don't, here
    jest.spyOn(global, "setTimeout").mockImplementation((fn) => { fn(); return 0; });
});
afterEach(() => {
    if (saved === undefined) delete process.env.SENDGRID_API_KEY;
    else process.env.SENDGRID_API_KEY = saved;
    jest.restoreAllMocks();
});
const send = () => fallback("a@example.com", "Subject", "Message", "<p>Message</p>");

describe.each([
    ["unset", undefined],
    ["empty", ""],
    ["blank", "   "],
])("with the key %s", (_name, key) => {
    beforeEach(() => {
        if (key === undefined) delete process.env.SENDGRID_API_KEY;
        else process.env.SENDGRID_API_KEY = key;
    });

    test("reports not sent without attempting or waiting", async () => {
        expect(await send()).toBe(false);
        expect(sendEmail).not.toHaveBeenCalled();
        expect(setTimeout).not.toHaveBeenCalled();
    });
});

describe("with a key", () => {
    beforeEach(() => { process.env.SENDGRID_API_KEY = "SG.test"; });

    test("sends, and reports it", async () => {
        sendEmail.mockResolvedValue({ status: true });
        expect(await send()).toBe(true);
        expect(sendEmail).toHaveBeenCalledTimes(1);
        expect(setTimeout).not.toHaveBeenCalled();
    });

    test("still retries a failed send, then reports not sent", async () => {
        sendEmail.mockResolvedValue({ status: false });
        expect(await send()).toBe(false);
        expect(sendEmail).toHaveBeenCalledTimes(5);
    });

    test("a retry can succeed", async () => {
        sendEmail.mockResolvedValueOnce({ status: false }).mockResolvedValueOnce({ status: true });
        expect(await send()).toBe(true);
        expect(sendEmail).toHaveBeenCalledTimes(2);
    });
});

test("the key is read when sending, so it can't be fixed before the environment is loaded", async () => {
    delete process.env.SENDGRID_API_KEY;
    expect(await send()).toBe(false);
    process.env.SENDGRID_API_KEY = "SG.test";
    sendEmail.mockResolvedValue({ status: true });
    expect(await send()).toBe(true);
});
