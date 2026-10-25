const express = require('express')

const {createSession,updateSession, editTerm, getCurrentSession, getAllSessions, getAllTermsInASession} = require('../controller/session')
const router = express.Router()

const multiProtect = require("../middleware/multipleAuth");


router.post('/create', multiProtect(["super admin", "admin", "staff"]), createSession);

router.put('/:id', multiProtect(["super admin", "admin", "staff"]), updateSession);
router.put('/term/:termId', multiProtect(["super admin"]), editTerm);

router.get('/', multiProtect(["super admin", "admin", "staff"]), getAllSessions)
router.get('/current', multiProtect(["super admin", "admin", "staff"]), getCurrentSession);
// One handler only: it scopes terms to the requester's school. An earlier
// unscoped handler was registered first on this same path and shadowed it.
router.get('/term/:sessionId', multiProtect(["super admin", "admin", "staff"]), getAllTermsInASession);

module.exports = router