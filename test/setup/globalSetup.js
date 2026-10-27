// One in-memory mongod for the whole run. Each test file connects to its
// own database on it (test/helpers/db.js), so files can run in parallel.
const { MongoMemoryServer } = require("mongodb-memory-server");

module.exports = async () => {
    const mongod = await MongoMemoryServer.create();
    globalThis.__MONGOD__ = mongod;
    // Workers are started after this and inherit the environment
    process.env.MONGO_TEST_URI = mongod.getUri();
};
