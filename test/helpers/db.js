const mongoose = require("mongoose");

// Connects this test file to its own database on the in-memory server.
// Refuses anything that isn't on localhost: config/config.env holds the
// live Atlas URI, and a test must never be able to write there.
const connect = async () => {
    const uri = process.env.MONGO_TEST_URI;
    if (!uri || !/^mongodb:\/\/(127\.0\.0\.1|localhost)[:/]/.test(uri)) {
        throw new Error(`Refusing to run tests against ${uri ? "a non-local database" : "no database"} — run them with npm test`);
    }
    const dbName = `test_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
    await mongoose.connect(uri, { dbName });
};

// Empty every collection, keeping indexes (unique constraints stay real)
const clear = async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
};

const disconnect = async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
};

// The usual lifecycle for a test file
const useTestDatabase = () => {
    beforeAll(connect);
    afterEach(clear);
    afterAll(disconnect);
};

module.exports = { connect, clear, disconnect, useTestDatabase };
