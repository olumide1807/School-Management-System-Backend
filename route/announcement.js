const { Router } = require('express');

const {createAnnouncement, getAllAnnouncement, getAnnouncementById, updateAnnouncement, deleteAnnouncement, getAllAvailableAnnouncement} = require("./../controller/announcement");
const multipleProtect = require("../middleware/multipleAuth");


const router = Router();

router.get('/', multipleProtect(["super admin", "admin", "academic", "non-academic", "student", "parent"]), getAllAnnouncement);
router.get('/:id', multipleProtect(["super admin", "admin", "academic", "non-academic", "student", "parent"]), getAnnouncementById);
router.put('/:id', multipleProtect(["super admin", "admin"]), updateAnnouncement);
router.delete('/:id', multipleProtect(["super admin", "admin"]), deleteAnnouncement);
router.post('/create', multipleProtect(["super admin", "admin"]), createAnnouncement);
// router.post('/create', createAnnouncement);

module.exports = router;