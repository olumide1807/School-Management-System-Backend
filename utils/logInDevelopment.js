// For anything that gives access to an account: reset codes, generated
// passwords. Anyone who can read production logs could otherwise take any
// account, so these reach the console only when NODE_ENV isn't "production".
// Read on each call, not at load, so it can't be fixed before dotenv has run.
const logInDevelopment = (...args) => {
    if (process.env.NODE_ENV !== "production") console.log(...args);
};

module.exports = { logInDevelopment };
