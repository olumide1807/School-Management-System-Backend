const { Router } = require("express");
const multipleProtect = require("../middleware/multipleAuth");

const {
    createClass,
    createClassArm,
    getAllClassLevels,
    getClassLevelById,
    updateClass,
    updateArm,
    deleteClass,
    deleteArm,
    getAllClassArms,
    getAllClassArmsInALevel,
    getClassArmById,
    assignTeacherToClass
} = require("../controller/class");


const router = Router();

// create
router.post('/', multipleProtect(["super admin", "admin"]), createClass);
router.post('/:classLevelId/arm', multipleProtect(["super admin", "admin"]), createClassArm);

// read

// get all class levels.
router.get('/', multipleProtect(["super admin", "admin", "academic"]), getAllClassLevels);

// get all class arms
router.get('/arm', multipleProtect(["super admin", "admin", "academic"]), getAllClassArms);


// get class arm by Id
router.get('/arm/:armId', multipleProtect(["super admin", "admin", "academic"]), getClassArmById);

// get all class arms in a level
router.get('/:levelId/arm', multipleProtect(["super admin", "admin", "academic"]), getAllClassArmsInALevel);

// get class level by Id
router.get('/:levelId', multipleProtect(["super admin", "admin", "academic"]), getClassLevelById);

// update
router.put('/:id', multipleProtect(["super admin", "admin"]), updateClass);
router.put('/arm/:id', multipleProtect(["super admin", "admin"]), updateArm);

// assign teacher
router.put('/:classArmId/teacher/assign/:staffId', multipleProtect(["super admin", "admin"]), assignTeacherToClass);

// delete
router.delete('/:id', multipleProtect(["super admin"]), deleteClass);
router.delete('/arm/:id', multipleProtect(["super admin"]), deleteArm);


module.exports = router;