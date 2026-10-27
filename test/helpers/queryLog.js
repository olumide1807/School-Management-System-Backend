const mongoose = require("mongoose");

// Records every find/findOne/findById the given models receive while `fn`
// runs, then restores them. The queries still run against the database.
//
// Use it to assert a handler's filters are scoped to the school. Asserting
// which document comes back can pass by luck — an unscoped lookup often
// returns the right one simply because it was inserted first.
async function recordQueries(models, fn) {
    const calls = [];
    const spies = models.flatMap((model) => ["find", "findOne", "findById"].map((method) =>
        jest.spyOn(model, method).mockImplementation(function (...args) {
            calls.push({ model: model.modelName, method, filter: args[0] });
            return mongoose.Model[method].apply(this, args);
        })));
    try {
        await fn();
    } finally {
        spies.forEach((s) => s.mockRestore());
    }
    return calls;
}

// The queries in `calls` that aren't filtered by this school (schoolId or
// school), plus any lookup by id alone — "Model.method" for each
const unscopedQueries = (calls, schoolId) =>
    calls
        .filter((c) => c.method === "findById" || String(c.filter?.schoolId ?? c.filter?.school ?? "") !== String(schoolId))
        .map((c) => `${c.model}.${c.method}`);

module.exports = { recordQueries, unscopedQueries };
