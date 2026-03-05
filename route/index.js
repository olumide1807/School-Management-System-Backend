const {Router} = require('express');
const { logout } = require('../controller')
const multipleProtect = require('../middleware/multipleAuth');

const router = Router();

router.get('/', (req, res) => {
    res.status(200).json({
        message: "welcome to SMS!"
    })
});

router.get('/logout', multipleProtect(["super admin", "admin", "academic", "non-academic", "student", "parent"]), logout)

module.exports = router;