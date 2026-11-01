const {Router} = require('express');

const router = Router();

router.get('/', (req, res) => {
    res.status(404).json({
        message: "The Page you're looking for is Not Found!"
    })
});

module.exports = router;