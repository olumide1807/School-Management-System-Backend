const mongoose = require('mongoose')

const inventorySchema = new mongoose.Schema({
    schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SuperAdmin",
        required: true
    },
    name: {
        type: String,
        required: true
    },
    quantity: {
        type: Number
    },
    price: {
        type: Number
    },
    dateBought:{
        type: Date
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
})

const inventoryModel = mongoose.model("inventory", inventorySchema)

module.exports = inventoryModel