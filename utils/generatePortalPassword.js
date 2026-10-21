const crypto = require("crypto");

// Initial or reset password for a parent or student portal account.
// Math.random is not cryptographically random; 6 random bytes in base64url
// is exactly 8 characters ([A-Za-z0-9_-]) with 48 bits of entropy and no
// padding.
const generatePortalPassword = () => crypto.randomBytes(6).toString("base64url");

module.exports = { generatePortalPassword };
