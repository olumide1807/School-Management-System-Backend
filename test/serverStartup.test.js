// Starting the real server.js the way a hosting platform does: the port comes
// from PORT, configuration comes from the environment, and config/config.env
// isn't there. dotenv's path is relative to the working directory, so running
// from an empty folder leaves the file out without touching it. The child gets
// only the variables named here, so it can't reach the live database.
const fs = require("fs");
const os = require("os");
const net = require("net");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

jest.setTimeout(180000);

const SERVER = path.resolve(__dirname, "../server.js");
const SYSTEM = ["PATH", "Path", "SystemRoot", "TEMP", "TMP", "windir", "ComSpec", "PATHEXT"];
const systemEnv = Object.fromEntries(SYSTEM.filter((k) => process.env[k]).map((k) => [k, process.env[k]]));

const emptyFolder = fs.mkdtempSync(path.join(os.tmpdir(), "no-config-"));
const database = () => {
    const uri = process.env.MONGO_TEST_URI;
    if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)[:/]/.test(uri || "")) throw new Error("Tests run against the local in-memory database only");
    return `${uri.replace(/\/$/, "")}/startup_${process.pid}`;
};

let child;
let output = "";
afterEach(async () => {
    if (!child) return;
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill();
    await exited;
    child = undefined;
});
afterAll(() => fs.rmSync(emptyFolder, { recursive: true, force: true }));

// Resolves with the port it says it's on, or rejects if it dies first
const start = (env) =>
    new Promise((resolve, reject) => {
        child = spawn(process.execPath, [SERVER], { cwd: emptyFolder, env: { ...systemEnv, ...env } });
        output = "";
        const read = (chunk) => {
            output += chunk;
            const on = output.match(/server is on (\S+)/);
            if (on) resolve(on[1]);
        };
        child.stdout.on("data", read);
        child.stderr.on("data", read);
        child.once("exit", (code) => reject(new Error(`server exited with ${code} before listening:\n${output.slice(0, 500)}`)));
    });

const get = (port, url) =>
    new Promise((resolve, reject) => {
        http.get({ port, path: url }, (res) => {
            res.resume();
            res.on("end", () => resolve(res.statusCode));
        }).on("error", reject);
    });

// The port may take a moment to accept after the log line
const getWhenUp = async (port, url) => {
    for (let i = 0; i < 40; i++) {
        try { return await get(port, url); } catch { await new Promise((r) => setTimeout(r, 250)); }
    }
    throw new Error(`nothing listening on ${port}`);
};

const freePort = () =>
    new Promise((resolve, reject) => {
        const probe = net.createServer();
        probe.once("error", reject);
        probe.listen(0, () => {
            const { port } = probe.address();
            probe.close(() => resolve(port));
        });
    });
const isFree = (port) =>
    new Promise((resolve) => {
        const probe = net.createServer();
        probe.once("error", () => resolve(false));
        probe.listen(port, () => probe.close(() => resolve(true)));
    });

test("listens on PORT, with no config.env and Sentry, Treblle, SendGrid and Cloudinary unset", async () => {
    const port = await freePort();
    expect(await start({ PORT: String(port), MONGO_URI: database() })).toBe(String(port));
    expect(await getWhenUp(port, "/")).toBe(200);
    expect(await get(port, "/no-such-route")).toBe(404);
    // The debug route that threw on demand is gone
    expect(await get(port, "/debug-sentry")).toBe(404);
    expect(child.exitCode).toBeNull();
});

test("falls back to 5002 with no PORT", async () => {
    // A dev server on this machine holds the port; the log line is all this
    // checks, and it can't be reached without binding
    if (!(await isFree(5002))) {
        console.warn("5002 is in use, so the fallback wasn't exercised");
        return;
    }
    expect(await start({ MONGO_URI: database() })).toBe("5002");
    expect(await getWhenUp(5002, "/")).toBe(200);
});

test("says whether email is on, so a mistyped switch doesn't look like a quiet inbox", async () => {
    await start({ NODE_ENV: "production", MONGO_URI: database(), JWT_SECRET: "x", PORT: String(await freePort()) });
    for (let i = 0; i < 40 && !output.includes("Email is"); i++) await new Promise((r) => setTimeout(r, 250));
    expect(output).toContain("Email is off");
});
