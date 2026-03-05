const express = require('express')

const {createSession,updateSession, editTerm, getCurrentSession, getAllSessions, getAllTermsInASession, getTermsinSesson} = require('../controller/session')
const router = express.Router()

const multiProtect = require("../middleware/multipleAuth");


router.post('/create', multiProtect(["super admin"]), createSession);

router.put('/:id', multiProtect(["super admin"]), updateSession);
router.put('/term/:termId', multiProtect(["super admin"]), editTerm);

router.get('/', multiProtect(["super admin"]), getAllSessions)
router.get('/current', multiProtect(["super admin"]), getCurrentSession);
router.get('/term/:id',multiProtect(["super admin"]), getTermsinSesson)
router.get('/term/:sessionId', multiProtect(["super admin"]), getAllTermsInASession);

module.exports = router