// Tests run against a throwaway in-memory MongoDB (mongodb-memory-server),
// started once per run in test/setup/globalSetup.js. They never read
// config/config.env, and test/helpers/db.js refuses any database that
// isn't on localhost.
module.exports = {
    testEnvironment: "node",
    roots: ["<rootDir>/test"],
    globalSetup: "<rootDir>/test/setup/globalSetup.js",
    globalTeardown: "<rootDir>/test/setup/globalTeardown.js",
    // The first start of mongod on a cold machine can take a while
    testTimeout: 30000,
};
