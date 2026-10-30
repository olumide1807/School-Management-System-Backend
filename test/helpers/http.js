const errorHandler = require("../../middleware/error");

// Calls an Express handler the way the router does and resolves with
// { status, body } — the response the client would get. Errors passed to
// next() go through the app's real error handler (middleware/error.js),
// so a test sees the same status and body a browser would.
const run = (handler, req) =>
    new Promise((resolve, reject) => {
        const res = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            cookies: {},
            cookie(name, value) { this.cookies[name] = value; return this; },
            json(body) { resolve({ status: this.statusCode, body }); return this; },
        };
        const next = (err) => {
            if (!err) return reject(new Error("handler called next() without an error"));
            // errorHandler logs every error; keep test output readable. Swap
            // console.log out and put back exactly what was there — a spy a
            // test installed included (jest.spyOn would return that same spy,
            // and mockRestore would then remove it for the rest of the test).
            const log = console.log;
            console.log = () => {};
            try { errorHandler(err, req, res, () => {}); } finally { console.log = log; }
        };
        Promise.resolve(handler(req, res, next)).catch(reject);
    });

// The req.user shapes the auth middleware produces
const asSchool = (schoolId) => ({ user: { schoolName: "Test School", id: String(schoolId), _id: schoolId } });
const asParent = (parentId, schoolId) => ({ user: { _id: parentId, id: String(parentId), schoolId, role: "parent" } });
const asStudent = (studentId) => ({ user: { _id: studentId, id: String(studentId), role: "student" } });

module.exports = { run, asSchool, asParent, asStudent };
