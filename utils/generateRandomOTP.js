const crypto = require("crypto");

// A one-time password for the forgot-password flow: a 6-digit number,
// 100000–999999 (verifyOTP's validator requires exactly that).
//
// From crypto.randomBytes, never Math.random: V8's Math.random is
// xorshift128+, whose state can be recovered from a handful of outputs —
// and anyone who can predict an OTP can reset that account's password.
const MIN = 100000;
const RANGE = 900000; // 100000..999999

// Three bytes give 0..16777215. Values at or above the largest multiple of
// RANGE that fits are drawn again rather than wrapped with %, which would
// make 100000–675999 about 5% more likely than the rest.
const SPACE = 2 ** 24;
const LIMIT = SPACE - (SPACE % RANGE);

exports.generateRandomOTP = () => {
    for (;;) {
        const n = crypto.randomBytes(3).readUIntBE(0, 3);
        if (n < LIMIT) return MIN + (n % RANGE);
    }
};
