const crypto = require("crypto");

// A one-time password for the forgot-password flow: a 4-digit number,
// 1000–9999, as verifyOTP expects (controller/passwords.js stores it as a
// string and compares it with the number the user types).
//
// From crypto.randomBytes, never Math.random: V8's Math.random is
// xorshift128+, whose state can be recovered from a handful of outputs —
// and anyone who can predict an OTP can reset that account's password.
const MIN = 1000;
const RANGE = 9000; // 1000..9999

// Two bytes give 0..65535. Values at or above the largest multiple of
// RANGE that fits (63000) are drawn again rather than wrapped with %,
// which would make the low OTPs more likely than the rest.
const LIMIT = 65536 - (65536 % RANGE);

exports.generateRandomOTP = () => {
    for (;;) {
        const n = crypto.randomBytes(2).readUInt16BE(0);
        if (n < LIMIT) return MIN + (n % RANGE);
    }
};
