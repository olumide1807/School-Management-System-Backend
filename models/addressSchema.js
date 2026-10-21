const mongoose = require('mongoose');

// The one address shape in the system, embedded by both students and
// parents. Not a model of its own — it has no collection.
const addressSchema = new mongoose.Schema({
    number: Number,
    street: String,
    city: String,
    state: String,
    postalCode: String,
    country: String
});

module.exports = addressSchema;
