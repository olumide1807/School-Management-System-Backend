const crypto = require("crypto");

// Every generated password: initial or reset passwords for staff, parents,
// students and super admins. One generator, so they're all made one way.
//
// These are mostly read aloud — office staff phone them to parents with no
// email — so the alphabet is single-case with the confusable characters
// removed: no I/L/1, O/0, U (reads as V), and no punctuation.
const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789"; // 30 characters
const LENGTH = 10; // log2(30) * 10 ≈ 49 bits — at least the 48 we had

// Largest multiple of the alphabet size that fits in a byte (240). Bytes
// at or above it are discarded rather than wrapped with %, which would
// make the first 16 characters more likely than the rest.
const LIMIT = 256 - (256 % ALPHABET.length);

const generatePortalPassword = () => {
    let password = "";
    while (password.length < LENGTH) {
        // ~6% of bytes are rejected, so a small over-draw usually suffices
        for (const byte of crypto.randomBytes(LENGTH * 2)) {
            if (byte >= LIMIT) continue;
            password += ALPHABET[byte % ALPHABET.length];
            if (password.length === LENGTH) break;
        }
    }
    return password;
};

module.exports = { generatePortalPassword, ALPHABET, LENGTH };
