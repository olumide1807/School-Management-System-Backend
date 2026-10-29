# CLAUDE.md — School Management System (Backend)

Express + Mongoose API for a multi-tenant school management system aimed at
Nigerian schools. The React frontend lives in a **separate repo**
(`School-Management-System-Frontend`, usually a sibling folder on disk).

- Run: `npm run dev` (nodemon) · Test: `npm test` (see §9)
- Port: **5002**, hardcoded in `app.listen(5002, ...)` in `server.js`.
  `process.env.PORT` is read into a global and only used in the log line — it
  does not actually change the port. Don't "fix" this without checking the
  frontend's `.env` (`API_URL`) first.
- Env: loaded from `./config/config.env` (not `.env`), via
  `dotenv.config({ path: "./config/config.env" })`.

---

## 1. Multi-tenancy — the rule that breaks everything else

Every document is scoped by `schoolId`. **`schoolId` always comes from
`req.user`, never from the request body or params.**

The canonical helper, repeated at the top of most controllers:

```js
const getSchoolId = (req) => (req.user.schoolName ? req.user.id : req.user.schoolId);
```

A super admin *is* the school (their `_id` is the tenant key, and they're the
only user document with a `schoolName`). Everyone else carries a `schoolId`
pointing at that super admin.

**Why this matters more than usual here:** Mongoose silently drops query keys
whose value is `undefined`. So a typo like `req.user.schollId` doesn't throw —
it removes the tenant filter and returns *every school's* data. We hit exactly
this bug once (`schollId`). When adding a query, grep your own spelling.

Always filter on write too, not just read:
`findOne({ _id: id, schoolId })`, never `findById(id)`.

---

## 2. Auth and roles

`middleware/multipleAuth.js` exports `protect(allowedRoles)`. It verifies the
JWT, then tries each collection in order: **SuperAdmin → Staff → Student →
Parent**. The first match wins.

It sets:
- `req.user` — the user document
- `req.user.role` — `"super admin" | "admin" | "academic" | "non-academic" | "student" | "parent"`
- `req.user.userType` — **legacy**: `"admin"` for both super admins and
  `isAdmin` staff, `"staff"` for other staff, then `"student"` / `"parent"`.
  Old controllers still branch on this. Prefer `role` in new code.

Rules baked into the middleware:
- Super admins pass **every** route; you never need `"super admin"` in
  `allowedRoles`.
- `"staff"` in `allowedRoles` means *any* staff type (legacy, broad — prefer
  `"academic"` / `"non-academic"` / `"admin"`).
- `isAdmin` staff also satisfy `"academic"` and `"non-academic"`.

A teacher-facing route that 403s is usually missing `"academic"` in its
`allowedRoles` — that's how `timetable-grid/settings` broke.

### Forgot password (`controller/passwords.js`, super admins and staff)
`forgotpassword` → `verifyOTP` → `resetpassword`:
- **forgotpassword** issues a 6-digit code (stored hashed on the account,
  10 minutes, replaces any earlier one) and always answers the same 200,
  whether or not the email has an account — never reveal which do.
- **verifyOTP** spends the code and returns a single-use `resetToken`
  (stored as a SHA-256 hash, 15 minutes).
- **resetpassword** takes `{ token, password }` and nothing else. Setting
  the password and clearing the token is one atomic update.
- Limits are **per account**: 5 wrong guesses kill a code; 5 codes per
  account per rolling 24 hours. Each is enforced by one conditional
  update, so parallel requests can't get past it.
- Reset and OTP fields are `select: false` on every user model. Ask for
  them by name (`.select("+resetPasswordToken")`) or filter on them; never
  return them.

### Privilege escalation
`PUT /staff/:id` is self-service and **must** keep its field whitelist
(`selfEditableFields` in `controller/staff.js`, mirrored by the Joi schema in
`middleware/validation/Staff/updateStaff.js`). Before the whitelist existed,
raw `req.body` went to `findByIdAndUpdate`, so a teacher could set
`isAdmin: true` on themselves. School-owned facts — `emailAddress`,
`staffType`, `salary`, `employmentDate`, `isAdmin`, `staffID`, `schoolId`,
`isActive` — change only through the admin-only route.

---

## 3. Models

`models/index.js` is a barrel. **Export names are inconsistent and have caused
repeated `Cannot read properties of undefined (reading 'findOne')` crashes:**

- `SuperAdminModel` — capital S, unlike every other export
- `studentAttendanceModel` → file is `student_attendance.js`
- `resultPublicationModel`, `schoolCalendarModel`, `assessmentModel`

If a model comes back `undefined`, you got the name wrong. Check
`models/index.js`, or require the file directly.

---

## 4. Grading and results

### Assessment format (`models/assessment.js`)
Per **class level**, not per subject or class arm. Compound unique index on
`{ schoolId, classLevel }`.

```js
assessments: [{ name, maxScore, order, source: "manual" | "attendance" }]
```

- Marks **must total exactly 100** — enforced in `controller/assessment.js`
  (`assertTotalIsOneHundred`) and again in the UI. Everything downstream
  divides by 100, so a format summing to 95 corrupts every result silently.
- `source: "attendance"` is a column the teacher **cannot type into**. It's
  computed from the attendance register at read time. Schools that count
  attendance toward the term score add it as an assessment row; schools that
  don't, don't.

### Results (`models/result.js`)
Shape: `Terms[].subjects[].scores[]`, where each score is a **snapshot**:

```js
{ name: "CA 1", maxScore: 20, score: 17 }
```

Scores snapshot the format rather than referencing it **on purpose**. A school
that changes its assessment format mid-year must not retroactively rewrite last
term's report cards. Never replace these with a ref to `assessmentModel`.

Each subject entry also stores `format`: the **whole** format in force when it
was entered, attendance component included. The attendance part isn't a typed
score, so without this a past term's attendance component and column headings
came from today's format. `buildClassReport` reads each entry against its own
`format`; entries saved before it existed have none and fall back to the
current format (`scripts/backfillResultFormats.js` fills those it can know).

Marks are **one decimal place** (`utils/scorePrecision.js`): scores are
refused with more, and totals are rounded to it when stored and when built,
so the stored, printed and ranked figure are the same number.

Comments (`teacherComment`, `principalComment`) live per term on the result.

### Positions and totals — computed, never stored
`utils/buildClassReport.js` is the **single source of truth** for a class
report: totals, averages, positions, attendance-derived scores, grades.

Both the staff view (`controller/result.js → getClassReport`) and the student /
parent portal (`controller/portal.js`) call it. `getClassReport` is a thin
wrapper. **Do not** compute positions in a second place — if the staff view and
the family view ever disagree about a child's position, the school loses trust
in the whole system.

Positions use **competition ranking**: ties share a position, and the next rank
skips (1, 2, 2, 4).

Grade bands and the banded report comments are matched by `bandFor`: the band
with the **highest lower bound the value reaches**. Only lower bounds count, so
69.5 with bands 60–69 and 70–100 is in 60–69 — never in no band at all.

### Publication gating (`models/resultPublication.js`)
Results are hidden from students and parents until published.

**Presence of the document means published.** Unpublishing *deletes* the row;
there is no `isPublished` boolean. Unique on
`{ schoolId, classArm, term, session }`.

Any new family-facing endpoint that returns scores must check publication
first. Staff endpoints must not.

---

## 5. Attendance

`utils/schoolDay.js` is the single answer to "is school open?":
`toDayStart`, `isWeekend`, `findClosure`, `isSchoolDay`.

- **All dates are start-of-day UTC** (`setUTCHours(0,0,0,0)`). Calendar entries
  and attendance records must line up exactly, so anything that creates or
  queries a date goes through `toDayStart`. A local-midnight `Date` will miss.
- Weekends and `schoolCalendarModel` closures are not school days. The register
  refuses them; the UI hides them.
- **Whether an entry closes the school is `closesSchool`, never its type**, and
  it's read in exactly two ways that must agree: the query `CLOSES_SCHOOL`
  (`{ $ne: false }`, used by the register and the auto-marker) and the helper
  `closesSchool(entry)` for anything in memory. Only an explicit `false` is
  open; absent is closed (fails safe). Never read `entry.closesSchool`
  directly, and never let a default fill it on load — the model's default
  applies to new entries only. `test/closesSchool.test.js` holds the two
  readings together for every stored value and type. We shipped weekend bugs twice (a `dayKey()`
  returning `"saturday"` with no timetable grid, and a "take attendance" banner
  showing on a Saturday) — guard on both sides.

### Auto-marking (`utils/attendanceScheduler.js`)
Runs every 30 minutes. After the school's closing time, any student with no
register entry for that day is marked absent with **`autoMarked: true`**.

- Idempotent — safe to re-run.
- Skips weekends and calendar closures.
- **`autoMarked` days are excluded from attendance-derived assessment scores.**
  A day nobody took the register is a staff failure, not a child's absence.
  It still shows in the attendance view, flagged, so the school can see the gap.
- A configured school calendar is a prerequisite. Without one, the scheduler
  would mark absences through the holidays.

### Two schedulers, both started in the `app.listen` callback
`startScheduler()` (session/term auto-activation, `utils/sessionScheduler.js`)
and `startAttendanceScheduler()`. They run in-process, so they fire once per
running instance — this will double-mark if the API is ever scaled horizontally.

---

## 6. Portals

`controller/portal.js`, mounted at `/portal`:
`getStudentPortalHome`, `getStudentResults`, `getStudentAttendance`,
`getParentPortalHome`.

- Students log in with their **student ID** + password (`studentLogin` in
  `controller/auth.js`). Parents log in with email.
- `password` on `studentModel` is `select: false`. Fetch it explicitly when
  authenticating.
- `mustChangePassword` defaults true on both students and parents; the frontend
  routes them to the change-password screen.
- `scripts/hashStudentPasswords.js` was a one-off migration — early students
  had their student ID stored as a plaintext password. It has been run. Don't
  run it again without checking.

**Parent scoping:** every parent endpoint must verify the requesting parent is
in the child's `guardians` before returning anything. A parent passing another
family's child ID must get a 404/403, not data. This is the single easiest
place in the codebase to leak a child's records.

---

## 7. Known rough edges

Don't be surprised by these; don't silently "fix" them either.

- **`config/config.env` is tracked in git** — `.gitignore` only covers
  `node_modules` and `testground.js`. Live Atlas credentials, `JWT_SECRET`,
  SendGrid and Cloudinary keys have been committed. These need rotating and the
  file needs removing from the index (`git rm --cached config/config.env`) plus
  a `.gitignore` entry. Until that's done, treat every credential in it as
  public.
- **SendGrid is not configured.** Generated passwords are returned in API
  responses and logged to the console instead of being emailed. That's a
  deliberate stopgap, not an oversight — but it must not ship.
- **Two staff-attendance systems.** `route/staffAttendance.js` and a legacy set
  of `/attendance` routes on the staff router both exist. The legacy one is
  dead; it hasn't been removed yet.
- **Dead `schoolSettings.gradingScale`** — there's an editor for it in the
  frontend's AppSettings, but nothing reads it. Grades come from `gradeModel`.
- **`for (id of [...])` pattern.** Several controllers had loops reassigning a
  `const` from an outer scope (`editSpecificSubject` was the first). Always
  declare the loop variable: `for (const currentId of ...)`.
- `controller/staff.txt` and `axios_solution1.js` are leftovers.
- `resetDB.js` does what it says. Don't run it against Atlas.

---

## 8. Conventions

- `asyncHandler` wraps every controller; errors go through
  `next(new ErrorResponse(msg, status))` to `middleware/error.js`.
- Responses go through `successResponse(res, status, message, data)` from
  `utils/successResponse.js`.
- Validate `ObjectId` params with `isValidMongoId` before querying.
- **Comparing ids:** always `String(a) === String(b)`. A raw `===` between an
  ObjectId and a string is always false, and it fails quietly.
- An unconfigured thing is an **empty state, not an error**. A class level with
  no assessment format returns `200` with `null`, so the teacher's score sheet
  can say "not set up yet" instead of failing.
- Joi validators live in `middleware/validation/`, grouped by resource.

---

## 9. Tests

Jest, against a throwaway in-memory MongoDB (`mongodb-memory-server`; the
mongod binary is downloaded once and cached). `npm test` runs everything.
Tests live in `test/`.

- `test/setup/globalSetup.js` starts one mongod per run; each test file
  gets its own database on it (`test/helpers/db.js` → `useTestDatabase()`),
  emptied after every test. **Tests never read `config/config.env`**, and
  the helper refuses any database that isn't on localhost.
- `test/helpers/http.js` → `run(handler, req)` calls a controller the way
  the router does and returns `{ status, body }`, sending errors through
  the real `middleware/error.js`. `asSchool` / `asParent` / `asStudent`
  build the `req.user` the auth middleware would.
- `test/helpers/factories.js` creates minimal valid documents.
- `test/helpers/reportFixture.js` builds a whole class for report-card tests:
  format, grade bands, subjects, students, scores (entered through the real
  `POST /result/batch` handler) and register records.
- Write real documents and query them; don't stub models. Hand-written
  stubs only agree with your reading of a query — the database checks the
  query itself. To store something the models would refuse (an old record),
  write to `Model.collection` directly.

What's covered, and why it matters:
- `portal.test.js` — the guardianship 404 is identical for every reason a
  parent can't see a child; results reach families only for published
  terms, and a parent gets their own child's report, not the class's.
- `buildFeeStatement.test.js` — kobo arithmetic, every status,
  `complete:false` for amounts it can't read, school scoping.
- `payments.test.js` — amount and method validation on `createPayment`;
  the duplicate-reference 409 and `confirmDuplicate`.
- `reopenedDays.test.js` — "a closed day that has started can't be
  reopened", through `findReopenedDays` and the calendar endpoints.
- `closesSchool.test.js` — the helper and the `$ne: false` query agree for
  every stored value and type.
- `buildClassReport.test.js` — competition ranking, totals and averages,
  attendance-derived scores, score snapshots, grade bands, school scoping.

**`test.failing` marks a known bug.** The test asserts the correct
behaviour and passes only while the code is still wrong; once the bug is
fixed it fails, and should become an ordinary `test`. Never make one pass by
changing its expectation. `grep -rn "KNOWN BUG" test/` lists them.

