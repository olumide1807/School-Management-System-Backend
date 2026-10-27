// Publishing is where "what's entered so far" becomes the school's
// statement about a child. A subject with components missing is still
// totalled, graded and ranked on what's there, so publication refuses while
// anything is missing — naming the subjects and students — unless the admin
// confirms with confirmIncomplete: true.
const M = require("../models");
const { publishResults } = require("../controller/result");
const { useTestDatabase } = require("./helpers/db");
const { run, asSchool } = require("./helpers/http");
const { reportFixture } = require("./helpers/reportFixture");

useTestDatabase();

const publish = (fx, o = {}) =>
    run(publishResults, {
        ...asSchool(fx.school),
        body: { classArmId: String(fx.arm._id), termId: String(fx.term._id), sessionId: String(fx.sess._id), ...o },
    });
const published = () => M.resultPublicationModel.countDocuments();
const INTRO = "Some scores haven't been entered, so these results would be published from partial marks — totals, grades and positions would count only what's there.";
const OUTRO = "Enter the missing scores first. If a subject genuinely wasn't taken, you can publish anyway.";

describe("publication refuses incomplete scores, naming them", () => {
    test("a missing component and a missing subject: 409, with every gap named, nothing published", async () => {
        const fx = await reportFixture({ students: ["Ada", "Bola", "Chidi"], subjects: ["Maths", "English"] });
        await fx.enterScores("Maths", { Ada: { CA: 30 }, Bola: { CA: 25, Exam: 50 }, Chidi: { CA: 20, Exam: 40 } });
        await fx.enterScores("English", { Ada: { CA: 30, Exam: 50 }, Bola: { CA: 25, Exam: 50 } });

        const r = await publish(fx);
        expect(r.status).toBe(409);
        expect(r.body.code).toBe("INCOMPLETE_SCORES");
        expect(r.body.error).toBe([INTRO, "Maths: Exam missing for Ada Ade.", "English: no scores for Chidi Ade.", OUTRO].join("\n"));
        expect(r.body.incomplete).toEqual([
            expect.objectContaining({ subjectName: "Maths", wholeClass: false, students: [expect.objectContaining({ name: "Ada Ade", noScores: false, missing: ["Exam"] })] }),
            expect.objectContaining({ subjectName: "English", wholeClass: false, students: [expect.objectContaining({ name: "Chidi Ade", noScores: true, missing: [] })] }),
        ]);
        expect(await published()).toBe(0);
    });

    test("a subject nobody sat reads as such", async () => {
        const fx = await reportFixture({ students: ["Ada", "Bola"], subjects: ["Maths", "French"] });
        await fx.enterScores("Maths", { Ada: { CA: 30, Exam: 50 }, Bola: { CA: 25, Exam: 50 } });
        const r = await publish(fx);
        expect(r.body.error).toBe([INTRO, "French: no scores for anyone in the class.", OUTRO].join("\n"));
    });

    test("students with the same gap are grouped, and a long list is cut short", async () => {
        const names = ["Ada", "Bola", "Chidi", "Dayo", "Ebun", "Femi", "Gbenga"];
        const fx = await reportFixture({ students: names });
        await fx.enterScores("Maths", Object.fromEntries(names.map((n) => [n, { CA: 20 }])));
        const r = await publish(fx);
        expect(r.body.error.split("\n")[1]).toBe("Maths: Exam missing for Ada Ade, Bola Ade, Chidi Ade, Dayo Ade, Ebun Ade and 2 more.");
        // The full list is in the response, for a screen to show
        expect(r.body.incomplete[0].students).toHaveLength(7);
    });

    test("a deactivated student isn't expected to have scores", async () => {
        const fx = await reportFixture({ students: ["Ada", "Bola"] });
        await fx.enterScores("Maths", { Ada: { CA: 30, Exam: 50 } });
        await M.studentModel.updateOne({ _id: fx.studentIds.Bola }, { status: "deactivated" });
        expect((await publish(fx)).status).toBe(201);
    });
});

describe("what counts as complete", () => {
    test("every component entered: published without asking", async () => {
        const fx = await reportFixture({ students: ["Ada"] });
        await fx.enterScores("Maths", { Ada: { CA: 30, Exam: 50 } });
        expect((await publish(fx)).status).toBe(201);
        expect(await published()).toBe(1);
    });

    test("judged against the format the scores were entered under, not today's", async () => {
        const fx = await reportFixture({ students: ["Ada"] });
        await fx.enterScores("Maths", { Ada: { CA: 30, Exam: 50 } });
        // A component added after the scores went in isn't missing from them
        await fx.setFormat([{ name: "CA", maxScore: 30, order: 1 }, { name: "Project", maxScore: 10, order: 2 }, { name: "Exam", maxScore: 60, order: 3 }]);
        expect((await publish(fx)).status).toBe(201);
    });

    test("an attendance component isn't a score anyone enters, so it's never missing", async () => {
        const fx = await reportFixture({
            students: ["Ada"],
            format: [{ name: "CA", maxScore: 30, order: 1 }, { name: "Exam", maxScore: 60, order: 2 }, { name: "Attendance", maxScore: 10, order: 3, source: "attendance" }],
        });
        await fx.enterScores("Maths", { Ada: { CA: 20, Exam: 50 } });
        expect((await publish(fx)).status).toBe(201);
    });
});

describe("the admin can confirm, but it isn't the default", () => {
    test("confirmIncomplete: true publishes anyway", async () => {
        const fx = await reportFixture({ students: ["Ada"] });
        await fx.enterScores("Maths", { Ada: { CA: 30 } });
        expect((await publish(fx, { confirmIncomplete: true })).status).toBe(201);
        expect(await published()).toBe(1);
    });

    test.each(["true", 1, "yes", false])("confirmIncomplete must be the boolean true, not %p", async (confirmIncomplete) => {
        const fx = await reportFixture({ students: ["Ada"] });
        await fx.enterScores("Maths", { Ada: { CA: 30 } });
        expect((await publish(fx, { confirmIncomplete })).status).toBe(409);
        expect(await published()).toBe(0);
    });
});
