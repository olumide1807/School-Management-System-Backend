// The token cookie's domain comes from COOKIE_DOMAIN, and is left off when
// that's unset, so the browser ties it to whichever host answered. A hardcoded
// domain made browsers reject the cookie on any other host.
const { sendTokenResponse } = require("../utils/sendResponseToken");
const { logout } = require("../controller");

const saved = { COOKIE_DOMAIN: process.env.COOKIE_DOMAIN, NODE_ENV: process.env.NODE_ENV, JWT_SECRET: process.env.JWT_SECRET, JWT_EXPIRE: process.env.JWT_EXPIRE };
const setEnv = (values) => {
    for (const [k, v] of Object.entries(values)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
};
beforeEach(() => {
    setEnv({ JWT_SECRET: "test-secret", JWT_EXPIRE: "1h", COOKIE_DOMAIN: undefined, NODE_ENV: "test" });
    jest.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
    setEnv(saved);
    jest.restoreAllMocks();
});

const fakeRes = () => ({
    status() { return this; },
    json() { return this; },
    cookie(name, value, options) { this.set = { name, options }; },
    clearCookie(name, options) { this.cleared = { name, options }; },
});
const issued = () => {
    const res = fakeRes();
    sendTokenResponse("user-id", 200, res);
    return res.set.options;
};
const cleared = async () => {
    const res = fakeRes();
    await logout({}, res);
    return res.cleared.options;
};

describe.each(["development", "production", "test"])("with NODE_ENV=%s", (env) => {
    beforeEach(() => setEnv({ NODE_ENV: env }));

    test("no COOKIE_DOMAIN: the cookie names no domain, set or cleared", async () => {
        expect(issued()).not.toHaveProperty("domain");
        expect(await cleared()).not.toHaveProperty("domain");
    });

    test("COOKIE_DOMAIN set: it's used, and logout clears the same cookie", async () => {
        setEnv({ COOKIE_DOMAIN: "api.greenhill.ng" });
        expect(issued().domain).toBe("api.greenhill.ng");
        expect(await cleared()).toMatchObject({ domain: "api.greenhill.ng", path: issued().path });
    });
});

test("the cookie is Secure in production only", () => {
    setEnv({ NODE_ENV: "production" });
    expect(issued().secure).toBe(true);
    setEnv({ NODE_ENV: "development" });
    expect(issued().secure).toBeUndefined();
});

test("the rest of the cookie is unchanged", () => {
    expect(issued()).toMatchObject({ httpOnly: true, signed: true, path: "/" });
});
