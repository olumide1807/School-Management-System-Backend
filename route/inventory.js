const {createInventory , getInventory, editInventory, deleteInventory} = require('../controller/inventory');

const router = require('express').Router();
// const {protect} = require('../middleware/auth');

const multiProtect = require("../middleware/multipleAuth");

router.post('/create', multiProtect(["super admin"]), createInventory)
router.get('/get', multiProtect(["super admin"]), getInventory)
router.put('/edit/:id', multiProtect(["super admin"]), editInventory)
router.delete('/delete/:id', multiProtect(["super admin"]), deleteInventory)

module.exports = router;