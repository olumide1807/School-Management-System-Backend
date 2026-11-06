// The same send with retries. Only a send that was attempted is worth retrying.
jest.mock("../utils/sendEmail", () => jest.fn());

let sendEmail, fallback;

// The retry count lives in the module, so each test loads a fresh copy
beforeEach(() => {
    jest.resetModules();
    sendEmail = require("../utils/sendEmail");
    fallback = require("../utils/sendNotificationFallback");
    jest.spyOn(console, "log").mockImplementation(() => {});
    // The retries wait five seconds each; don't, here
    jest.spyOn(global, "setTimeout").mockImplementation((fn) => { fn(); return 0; });
});
afterEach(() => jest.restoreAllMocks());
const send = () => fallback("a@example.com", "Subject", "Message", "<p>Message</p>");

test("nothing attempted: reports not sent without retrying or waiting", async () => {
    sendEmail.mockResolvedValue({ status: false, skipped: true });
    expect(await send()).toBe(false);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(setTimeout).not.toHaveBeenCalled();
});

test("sends, and reports it", async () => {
    sendEmail.mockResolvedValue({ status: true });
    expect(await send()).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith("a@example.com", "Subject", "Message", "<p>Message</p>");
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
