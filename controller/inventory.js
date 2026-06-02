const asyncHandler = require("../middleware/async");
const ErrorResponse = require("../utils/errorResponse");
const { successResponse } = require("../utils/successResponse");
const { isValidMongoId } = require("../utils/isValidMongoObjectId");
const validateCreate = require("../middleware/validation/inventory/create");
const validateEdit = require("../middleware/validation/inventory/edit");
const validateStockMovement = require("../middleware/validation/inventory/stockMovement");
const { inventoryModel, stockMovementModel } = require("../models");

// helper: super admin acts as own school
const getSchoolId = (req) =>
    req.user.schoolName ? req.user.id : req.user.schoolId;

// helper: determine if movement type ADDS or REMOVES stock
// restock = add
// consumed / damaged / lost / returned = remove
const isAdditiveMovement = (type) => type === "restock";

// helper: friendly snapshot of who recorded the movement
const getRecorderName = (user) => {
    if (user.schoolName) return user.schoolName; // super admin's school
    const parts = [user.firstName, user.surName].filter(Boolean);
    return parts.join(" ") || user.email || "Unknown";
};

// ============================================================
// CREATE
// ============================================================
exports.createInventory = asyncHandler(async (req, res, next) => {
    try {
        const { error } = validateCreate(req.body);
        if (error) {
            return next(new ErrorResponse(error.details[0].message, 400));
        }

        const schoolId = getSchoolId(req);
        const { name } = req.body;

        const exists = await inventoryModel.findOne({
            schoolId,
            name: name.trim(),
            isDeleted: false
        });

        if (exists) {
            return next(new ErrorResponse(
                `Inventory item "${name}" already exists`, 400
            ));
        }

        const newItem = await inventoryModel.create({
            ...req.body,
            name: name.trim(),
            schoolId
        });

        successResponse(res, 201, "Inventory item created successfully", newItem);
    } catch (e) {
        console.error("Error creating inventory:", e);
        next(e);
    }
});

// ============================================================
// GET ALL
// ============================================================
exports.getInventory = asyncHandler(async (req, res, next) => {
    try {
        const schoolId = getSchoolId(req);
        const includeDeleted = req.query.includeDeleted === "true";

        const filter = { schoolId };
        if (!includeDeleted) filter.isDeleted = false;

        const items = await inventoryModel.find(filter).sort({ createdAt: -1 });
        successResponse(res, 200, null, items);
    } catch (e) {
        console.error("Error getting inventory:", e);
        next(e);
    }
});

// ============================================================
// GET BY ID
// ============================================================
exports.getInventoryById = asyncHandler(async (req, res, next) => {
    try {
        const schoolId = getSchoolId(req);
        const { id } = req.params;

        if (!isValidMongoId(id)) {
            return next(new ErrorResponse("Invalid inventory id", 400));
        }

        const item = await inventoryModel.findOne({ _id: id, schoolId });
        if (!item) {
            return next(new ErrorResponse("Inventory item not found", 404));
        }

        successResponse(res, 200, null, item);
    } catch (e) {
        console.error("Error getting inventory item:", e);
        next(e);
    }
});

// ============================================================
// EDIT
// ============================================================
exports.editInventory = asyncHandler(async (req, res, next) => {
    try {
        const { error } = validateEdit(req.body);
        if (error) {
            return next(new ErrorResponse(error.details[0].message, 400));
        }

        const schoolId = getSchoolId(req);
        const { id } = req.params;

        if (!isValidMongoId(id)) {
            return next(new ErrorResponse("Invalid inventory id", 400));
        }

        const item = await inventoryModel.findOne({ _id: id, schoolId });
        if (!item) {
            return next(new ErrorResponse("Inventory item not found", 404));
        }

        if (req.body.name && req.body.name.trim() !== item.name) {
            const duplicate = await inventoryModel.findOne({
                schoolId,
                name: req.body.name.trim(),
                isDeleted: false,
                _id: { $ne: id }
            });
            if (duplicate) {
                return next(new ErrorResponse(
                    `Another inventory item with name "${req.body.name}" already exists`, 400
                ));
            }
        }

        const updates = { ...req.body };
        if (updates.name) updates.name = updates.name.trim();

        Object.assign(item, updates);
        await item.save();

        successResponse(res, 200, "Inventory item updated successfully", item);
    } catch (e) {
        console.error("Error editing inventory:", e);
        next(e);
    }
});

// ============================================================
// SOFT DELETE
// ============================================================
exports.deleteInventory = asyncHandler(async (req, res, next) => {
    try {
        const schoolId = getSchoolId(req);
        const { id } = req.params;

        if (!isValidMongoId(id)) {
            return next(new ErrorResponse("Invalid inventory id", 400));
        }

        const item = await inventoryModel.findOne({ _id: id, schoolId });
        if (!item) {
            return next(new ErrorResponse("Inventory item not found", 404));
        }

        if (item.isDeleted) {
            return next(new ErrorResponse("Item is already deleted", 400));
        }

        item.isDeleted = true;
        item.deletedAt = new Date();
        await item.save();

        successResponse(res, 200, "Inventory item deleted successfully");
    } catch (e) {
        console.error("Error deleting inventory:", e);
        next(e);
    }
});

// ============================================================
// RESTORE
// ============================================================
exports.restoreInventory = asyncHandler(async (req, res, next) => {
    try {
        const schoolId = getSchoolId(req);
        const { id } = req.params;

        if (!isValidMongoId(id)) {
            return next(new ErrorResponse("Invalid inventory id", 400));
        }

        const item = await inventoryModel.findOne({ _id: id, schoolId });
        if (!item) {
            return next(new ErrorResponse("Inventory item not found", 404));
        }

        if (!item.isDeleted) {
            return next(new ErrorResponse("Item is not deleted", 400));
        }

        const duplicate = await inventoryModel.findOne({
            schoolId,
            name: item.name,
            isDeleted: false
        });
        if (duplicate) {
            return next(new ErrorResponse(
                `Cannot restore: an active item named "${item.name}" already exists`, 400
            ));
        }

        item.isDeleted = false;
        item.deletedAt = null;
        await item.save();

        successResponse(res, 200, "Inventory item restored successfully", item);
    } catch (e) {
        console.error("Error restoring inventory:", e);
        next(e);
    }
});

// ============================================================
// RECORD A STOCK MOVEMENT
// POST /inventory/:id/movements
// body: { type, quantity, note? }
// ============================================================
exports.recordStockMovement = asyncHandler(async (req, res, next) => {
    try {
        const { error } = validateStockMovement(req.body);
        if (error) {
            return next(new ErrorResponse(error.details[0].message, 400));
        }

        const schoolId = getSchoolId(req);
        const { id } = req.params;

        if (!isValidMongoId(id)) {
            return next(new ErrorResponse("Invalid inventory id", 400));
        }

        const item = await inventoryModel.findOne({
            _id: id,
            schoolId,
            isDeleted: false
        });
        if (!item) {
            return next(new ErrorResponse("Inventory item not found", 404));
        }

        const { type, quantity, note } = req.body;
        const qty = Number(quantity);
        const quantityBefore = item.quantity;

        // Compute new quantity
        let quantityAfter;
        if (isAdditiveMovement(type)) {
            quantityAfter = quantityBefore + qty;
        } else {
            if (qty > quantityBefore) {
                return next(new ErrorResponse(
                    `Cannot ${type} ${qty} units — only ${quantityBefore} available`, 400
                ));
            }
            quantityAfter = quantityBefore - qty;
        }

        // Save movement
        const movement = await stockMovementModel.create({
            schoolId,
            inventoryId: item._id,
            type,
            quantity: qty,
            quantityBefore,
            quantityAfter,
            note: note || "",
            recordedBy: req.user.id,
            recordedByName: getRecorderName(req.user)
        });

        // Update item's current quantity
        item.quantity = quantityAfter;
        await item.save();

        successResponse(
            res,
            201,
            "Stock movement recorded successfully",
            { movement, item }
        );
    } catch (e) {
        console.error("Error recording stock movement:", e);
        next(e);
    }
});

// ============================================================
// GET STOCK MOVEMENTS FOR AN ITEM
// GET /inventory/:id/movements
// ============================================================
exports.getStockMovements = asyncHandler(async (req, res, next) => {
    try {
        const schoolId = getSchoolId(req);
        const { id } = req.params;

        if (!isValidMongoId(id)) {
            return next(new ErrorResponse("Invalid inventory id", 400));
        }

        const item = await inventoryModel.findOne({ _id: id, schoolId });
        if (!item) {
            return next(new ErrorResponse("Inventory item not found", 404));
        }

        const movements = await stockMovementModel
            .find({ schoolId, inventoryId: id })
            .sort({ createdAt: -1 });

        successResponse(res, 200, null, movements);
    } catch (e) {
        console.error("Error getting stock movements:", e);
        next(e);
    }
});