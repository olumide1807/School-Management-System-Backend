const express = require("express");
const {
    createInventory,
    getInventory,
    getInventoryById,
    editInventory,
    deleteInventory,
    restoreInventory,
    recordStockMovement,
    getStockMovements
} = require("../controller/inventory");
const multiProtect = require("../middleware/multipleAuth");

const router = express.Router();

// REST-conventional routes
router.post("/", multiProtect(["super admin"]), createInventory);
router.get("/", multiProtect(["super admin"]), getInventory);
router.get("/:id", multiProtect(["super admin"]), getInventoryById);
router.put("/:id", multiProtect(["super admin"]), editInventory);
router.delete("/:id", multiProtect(["super admin"]), deleteInventory);
router.put("/:id/restore", multiProtect(["super admin"]), restoreInventory);

// Stock movements
router.post("/:id/movements", multiProtect(["super admin"]), recordStockMovement);
router.get("/:id/movements", multiProtect(["super admin"]), getStockMovements);

// Legacy routes (for backward compatibility)
router.post("/create", multiProtect(["super admin"]), createInventory);
router.get("/get", multiProtect(["super admin"]), getInventory);
router.put("/edit/:id", multiProtect(["super admin"]), editInventory);
router.delete("/delete/:id", multiProtect(["super admin"]), deleteInventory);

module.exports = router;