const {
    resultModel,
    sessionModel,
    studentModel,
    classArmModel,
    termModel,
    assessmentModel,
    specificSubjectModel,
    studentAttendanceModel,
    schoolSettingsModel,
    resultPublicationModel,
    staffModel,
} = require("../models");
const gradeModel = require("../models/grade");

// Competition ranking: ties share a position, the next rank skips.
const rankBy = (items) => {
    const sorted = [...items].sort((a, b) => b.value - a.value);
    const positions = {};
    sorted.forEach((item, i) => {
        if (i > 0 && item.value === sorted[i - 1].value) {
            positions[item.id] = positions[sorted[i - 1].id];
        } else {
            positions[item.id] = i + 1;
        }
    });
    return positions;
};

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * Builds every student's report for one class arm and term.
 *
 * Shared so that the staff view and a student's own view can never
 * disagree — a position or average computed two different ways would
 * be worse than either.
 *
 * Returns null if the class arm doesn't belong to the school.
 */
async function buildClassReport(schoolId, classArmId, termId, sessionId) {
    const classArm = await classArmModel.findOne({ _id: classArmId, schoolId });
    if (!classArm) return null;

    const specifics = await specificSubjectModel
        .find({ classArmId, schoolId })
        .populate("subjectId", "subjectName");

    const [term, session, students, results, format, gradeDoc, attendance, settings, publication, formTeacher] =
        await Promise.all([
            termModel.findById(termId),
            sessionModel.findById(sessionId),
            studentModel
                .find({ classArmId, schoolId })
                .select("firstName surName otherName studentID gender profilePicture status"),
            resultModel.find({ school: schoolId, classArm: classArmId, session: sessionId }),
            assessmentModel.findOne({ schoolId, classLevel: classArm.classLevelId }),
            gradeModel.findOne({ schoolId }),
            studentAttendanceModel.find({ schoolId, classArmId, termId }),
            schoolSettingsModel.findOne({ schoolId }),
            resultPublicationModel.findOne({
                schoolId, classArm: classArmId, term: termId, session: sessionId,
            }),
            classArm.assignedTeacher
                ? staffModel.findOne({ _id: classArm.assignedTeacher, schoolId }).select("title firstName surname")
                : null,
        ]);

    if (!term || !session) return null;

    const bands = gradeDoc?.grades || [];
    const gradeFor = (total) => {
        const band = bands.find(
            (g) => total >= (g.scoreRange?.from ?? 0) && total <= (g.scoreRange?.to ?? 100)
        );
        return band
            ? { grade: band.grade, remark: band.remark, color: band.color }
            : { grade: null, remark: null, color: null };
    };

    const bandedComment = (commentBands, average) => {
        if (average === null || !commentBands?.length) return "";
        const band = commentBands.find((b) => average >= b.from && average <= b.to);
        return band?.text || "";
    };

    const definitions = format
        ? [...format.assessments].sort((a, b) => (a.order || 0) - (b.order || 0))
        : [];
    const attendanceDef = definitions.find((d) => d.source === "attendance") || null;

    const subjectList = specifics.map((sp) => ({
        subjectId: String(sp.subjectId?._id || sp.subjectId),
        subjectName: sp.subjectId?.subjectName || "Subject",
    }));

    // --- Attendance ---
    const attendanceByStudent = {};
    attendance.forEach((a) => {
        const sid = String(a.studentId);
        if (!attendanceByStudent[sid]) {
            attendanceByStudent[sid] = { present: 0, absent: 0, total: 0, autoMarked: 0 };
        }
        const rec = attendanceByStudent[sid];
        if (a.status === "present") rec.present++;
        if (a.status === "absent") rec.absent++;
        rec.total++;
        if (a.autoMarked) rec.autoMarked++;
    });

    // Auto-marked days are excluded from the score — a missed register
    // is the school's omission, not the child's
    const attendanceMarkFor = (sid) => {
        if (!attendanceDef) return null;
        const a = attendanceByStudent[sid];
        if (!a) return null;
        const scoredTotal = a.total - a.autoMarked;
        if (scoredTotal === 0) return null;
        return Math.round((a.present / scoredTotal) * attendanceDef.maxScore);
    };

    // --- Stored scores and comments ---
    const scoreIndex = {};
    const commentIndex = {};
    results.forEach((r) => {
        const termBlock = r.Terms.find((t) => String(t.termId) === String(termId));
        if (!termBlock) return;
        const sid = String(r.student);
        scoreIndex[sid] = {};
        termBlock.subjects.forEach((s) => {
            scoreIndex[sid][String(s.subject)] = s;
        });
        commentIndex[sid] = {
            teacher: termBlock.teacherComment || "",
            principal: termBlock.principalComment || "",
        };
    });

    // --- Effective totals ---
    const effective = {};
    students.forEach((st) => {
        const sid = String(st._id);
        const attMark = attendanceMarkFor(sid);
        effective[sid] = {};

        subjectList.forEach(({ subjectId }) => {
            const entry = scoreIndex[sid]?.[subjectId];
            if (!entry) {
                effective[sid][subjectId] = { entered: false, complete: false, scores: [], total: null };
                return;
            }

            const scores = [...entry.scores];
            let total = entry.Total;
            let complete = true;

            if (attendanceDef) {
                if (attMark === null) {
                    complete = false;
                } else {
                    scores.push({
                        name: attendanceDef.name,
                        maxScore: attendanceDef.maxScore,
                        score: attMark,
                    });
                    total += attMark;
                }
            }

            effective[sid][subjectId] = {
                entered: true,
                complete,
                scores,
                total: complete ? total : null,
            };
        });
    });

    // --- Per-subject stats and positions ---
    const subjectStats = {};
    const subjectPositions = {};

    subjectList.forEach(({ subjectId }) => {
        const entries = students
            .map((st) => {
                const e = effective[String(st._id)][subjectId];
                return e.complete ? { id: String(st._id), value: e.total } : null;
            })
            .filter(Boolean);

        if (entries.length === 0) {
            subjectStats[subjectId] = { highest: null, lowest: null, average: null, count: 0 };
            subjectPositions[subjectId] = {};
            return;
        }

        const values = entries.map((e) => e.value);
        subjectStats[subjectId] = {
            highest: Math.max(...values),
            lowest: Math.min(...values),
            average: round1(values.reduce((a, b) => a + b, 0) / values.length),
            count: values.length,
        };
        subjectPositions[subjectId] = rankBy(entries);
    });

    // --- Per-student reports ---
    const reports = students.map((st) => {
        const sid = String(st._id);
        const attMark = attendanceMarkFor(sid);

        const subjects = subjectList.map(({ subjectId, subjectName }) => {
            const e = effective[sid][subjectId];

            if (!e.entered) {
                return {
                    subjectId, subjectName, entered: false, complete: false,
                    scores: [], Total: null, grade: null, remark: null, position: null,
                };
            }
            if (!e.complete) {
                return {
                    subjectId, subjectName, entered: true, complete: false,
                    scores: e.scores, Total: null, grade: null,
                    remark: "Attendance not recorded", position: null,
                };
            }

            const g = gradeFor(e.total);
            return {
                subjectId, subjectName, entered: true, complete: true,
                scores: e.scores,
                Total: e.total,
                grade: g.grade,
                remark: g.remark,
                color: g.color,
                position: subjectPositions[subjectId]?.[sid] ?? null,
            };
        });

        const graded = subjects.filter((s) => s.complete);
        const totalScore = graded.reduce((sum, s) => sum + s.Total, 0);
        const average = graded.length > 0 ? round1(totalScore / graded.length) : null;

        return {
            student: st,
            subjects,
            summary: {
                totalScore,
                average,
                subjectsGraded: graded.length,
                subjectsOffered: subjectList.length,
                position: null,
                outOf: null,
            },
            attendance: {
                ...(attendanceByStudent[sid] || { present: 0, absent: 0, total: 0, autoMarked: 0 }),
                mark: attMark,
            },
            comments: {
                teacher: commentIndex[sid]?.teacher
                    || bandedComment(settings?.reportComments?.teacher, average),
                principal: commentIndex[sid]?.principal
                    || bandedComment(settings?.reportComments?.principal, average),
                teacherIsOverride: !!commentIndex[sid]?.teacher,
                principalIsOverride: !!commentIndex[sid]?.principal,
            },
        };
    });

    // --- Class position ---
    const rankable = reports
        .filter((r) => r.summary.average !== null)
        .map((r) => ({ id: String(r.student._id), value: r.summary.average }));
    const classPositions = rankBy(rankable);

    reports.forEach((r) => {
        r.summary.position = classPositions[String(r.student._id)] ?? null;
        r.summary.outOf = rankable.length;
    });

    return {
        classArm: {
            _id: classArm._id,
            armName: classArm.armName,
            classLevelId: classArm.classLevelId,
        },
        formTeacher: formTeacher
            ? {
                _id: formTeacher._id,
                name: `${formTeacher.title ? formTeacher.title + " " : ""}${formTeacher.firstName || ""} ${formTeacher.surname || ""}`.trim(),
            }
            : null,
        term: { _id: term._id, termName: term.termName },
        session: { _id: session._id, sessionName: session.sessionName },
        assessments: definitions.map((a) => ({
            name: a.name,
            maxScore: a.maxScore,
            source: a.source || "manual",
        })),
        subjects: subjectList.map((s) => ({ ...s, stats: subjectStats[s.subjectId] })),
        gradeBands: bands.map((b) => ({
            grade: b.grade,
            remark: b.remark,
            from: b.scoreRange?.from,
            to: b.scoreRange?.to,
        })),
        publication: publication
            ? { published: true, publishedAt: publication.publishedAt }
            : { published: false, publishedAt: null },
        reports,
    };
}

module.exports = { buildClassReport, rankBy, round1 };