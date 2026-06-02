const mongoose = require("mongoose");

const MOVEMENT_TYPES = [
    "restock",
    "consumed",
    "damaged",
    "lost",
    "returned"
];

const stockMovementSchema = new mongoose.Schema({
    schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SuperAdmin",
        required: true
    },
    inventoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Inventory",
        required: true
    },
    type: {
        type: String,
        enum: MOVEMENT_TYPES,
        required: true
    },
    quantity: {
        // Positive value — the effect (add or subtract) is determined by `type`
        type: Number,
        required: true,
        min: 1
    },
    quantityBefore: {
        type: Number,
        required: true
    },
    quantityAfter: {
        type: Number,
        required: true
    },
    note: {
        type: String,
        trim: true,
        default: ""
    },
    recordedBy: {
        // User id (super admin or staff) who recorded this movement
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    recordedByName: {
        // Snapshot of who did it (for history even if the user is removed later)
        type: String,
        default: ""
    }
}, { timestamps: true });

stockMovementSchema.index({ schoolId: 1, inventoryId: 1, createdAt: -1 });

module.exports = mongoose.model("StockMovement", stockMovementSchema);
module.exports.MOVEMENT_TYPES = MOVEMENT_TYPES;
