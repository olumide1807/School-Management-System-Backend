const {Router} = require('express');

const router = Router();

router.get('/', (req, res) => {
    res.status(404).json({
        message: "Not Found!"
    })
});

module.exports = router;