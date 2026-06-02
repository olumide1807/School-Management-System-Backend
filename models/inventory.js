const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
    schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SuperAdmin",
        required: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    category: {
        type: String,
        trim: true,
        default: ""
    },
    description: {
        type: String,
        trim: true,
        default: ""
    },
    quantity: {
        type: Number,
        required: true,
        min: 0,
        default: 0
    },
    minQuantity: {
        type: Number,
        min: 0,
        default: 0
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    supplier: {
        type: String,
        trim: true,
        default: ""
    },
    dateBought: {
        type: Date
    },
    isDeleted: {
        type: Boolean,
        default: false
    },
    deletedAt: {
        type: Date,
        default: null
    }
}, { timestamps: true });

// Prevent duplicate active items with the same name per school
inventorySchema.index(
    { schoolId: 1, name: 1, isDeleted: 1 },
    { unique: true, partialFilterExpression: { isDeleted: false } }
);

module.exports = mongoose.model("Inventory", inventorySchema);