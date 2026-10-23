// When a payment was received. It can be earlier than the day it's
// recorded (a Friday transfer entered on Tuesday) but never later than
// today.
//
// The Record Payment form sends a calendar day, "YYYY-MM-DD", which is
// stored as midnight UTC. Comparing that instant with "now" would reject
// today's date for the first hour of every day in Nigeria (UTC+1), so a
// day is compared with today's date in the school's timezone instead.
// A full timestamp is compared with now, allowing a little clock skew.

// Schools are in Nigeria (see CLAUDE.md). If that changes, this should
// come from the school's settings.
const SCHOOL_TIMEZONE = "Africa/Lagos";
const CLOCK_SKEW_MS = 5 * 60 * 1000;
const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// Today as YYYY-MM-DD in the school's timezone
const todayInSchool = (now = new Date()) =>
    new Intl.DateTimeFormat("en-CA", {
        timeZone: SCHOOL_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(now);

/**
 * @returns {{ date: Date } | { error: string }}
 *   No value → now. An unreadable or future value → an error, never a
 *   silent substitute.
 */
const resolvePaymentDate = (value, now = new Date()) => {
    if (value === undefined || value === null || value === "") return { date: now };

    if (typeof value === "string" && DAY_ONLY.test(value)) {
        const date = new Date(`${value}T00:00:00.000Z`);
        // Rejects impossible days like 2026-02-30, which Date would roll over
        if (isNaN(date) || date.toISOString().slice(0, 10) !== value) {
            return { error: "Payment date isn't a valid date" };
        }
        if (value > todayInSchool(now)) {
            return { error: "Payment date can't be in the future" };
        }
        return { date };
    }

    const date = new Date(value);
    if (isNaN(date)) return { error: "Payment date isn't a valid date" };
    if (date.getTime() > now.getTime() + CLOCK_SKEW_MS) {
        return { error: "Payment date can't be in the future" };
    }
    return { date };
};

module.exports = { resolvePaymentDate, todayInSchool, SCHOOL_TIMEZONE };
