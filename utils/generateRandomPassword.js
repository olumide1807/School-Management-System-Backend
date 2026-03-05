const crypto = require('crypto');

// Function to generate a random password
const generateRandomPassword = () => {
    const password = crypto
    .randomBytes(4)
    .toString('base64')
    .replace(/[+/]/g, '')
    .slice(0, 8);

    return password;
}

module.exports = generateRandomPassword;