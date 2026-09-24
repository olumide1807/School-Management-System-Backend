const express = require("express");

const multipleProtect = require("../middleware/multipleAuth");
const router = express.Router();

const { createParent, editParent, linkStudent, deleteParent, getAllParents, updateParent, resetParentPassword } = require("../controller/parent")

router.put('/:id', multipleProtect(["super admin", "admin"]), updateParent);

// create parent
router.post("/", multipleProtect(["super admin", "admin"]), createParent);

router.put("/:id/reset-password", multipleProtect(["super admin", "admin"]), resetParentPassword);

// edit parent
router.put("/:id", multipleProtect(["super admin", "admin"]), editParent);

// link student
router.put("/student/link/:id", multipleProtect(["super admin", "admin"]), linkStudent)

// delete parent
router.delete("/:id", multipleProtect(["super admin", "admin"]), deleteParent)

// get all parents
router.get("/", multipleProtect(["super admin", "admin"]), getAllParents)

module.exports = router;