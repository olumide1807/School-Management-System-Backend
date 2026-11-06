const { generatePortalPassword } = require("./generatePortalPassword");

// The one check that a password isn't something the account is already known
// by: its ID, email, phone number, name or, for a school, the school's own. It
// works from whichever of these fields the account has, so every kind of
// account and a not-yet-saved one can use it. Every path that sets a password
// goes through here; only an exact match counts, so a password merely
// containing one of these is fine.
const NAMES = ["firstName", "surName", "surname", "lastName", "otherName"];
const LABELS = {
    studentID: "student ID",
    staffID: "staff ID",
    email: "email address",
    emailAddress: "email address",
    schoolEmailAddress: "school's email address",
    schoolName: "school's name",
    schoolInitials: "school's initials",
};

// Capitals, spacing and punctuation don't make it any harder to guess
const squash = (text) => String(text ?? "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
// 0803…, +234803… and 234803… are one number
const phoneDigits = (text) => String(text ?? "").replace(/\D/g, "").slice(-10);

const ownIdentifierIn = (password, account) => {
    const typed = squash(password);
    if (!typed) return null;

    for (const [field, label] of Object.entries(LABELS)) {
        const value = account[field];
        if (typed === squash(value)) return label;
        // The part before the @ is the email, as far as guessing goes
        if (/email/i.test(field) && typed === squash(String(value ?? "").split("@")[0])) return label;
    }

    const phone = phoneDigits(account.phoneNumber);
    if (phone && /^\d+$/.test(typed) && phoneDigits(typed) === phone) return "phone number";

    const names = NAMES.map((field) => squash(account[field])).filter(Boolean);
    if (names.includes(typed)) return "name";
    if (names.some((a) => names.some((b) => a !== b && typed === a + b))) return "name";

    return null;
};

// The sentence to refuse a password with, or null if it's fine. Names what it
// matched, never the value: reset-by-code uses this too.
const ownIdentifierProblem = (password, account) => {
    const label = ownIdentifierIn(password, account);
    return label && `Your new password can't be your ${label}`;
};

// A generated password goes through the same check as a chosen one
const generatePasswordFor = (account) => {
    let password = generatePortalPassword();
    while (ownIdentifierIn(password, account)) password = generatePortalPassword();
    return password;
};

module.exports = { ownIdentifierProblem, generatePasswordFor };
