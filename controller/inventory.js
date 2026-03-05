const inventoryModel = require('../models/inventory')
const asyncHandler = require("../middleware/async");
const ErrorResponse = require("../utils/errorResponse");
const {timeFormat} = require('../utils/formatTime');

exports.createInventory = asyncHandler(async (req, res, next) => {
    const {name, quantity, price, dateBought} = req.body
    dateBought = timeFormat(dateBought,res)
    const schoolId = req.user.id

    const inventory = await inventoryModel.findOne({name, schoolId})

    if(inventory){
        return next(new ErrorResponse(`Inventory with name ${name} already exists`, 400))
    }

    const newInventory = await inventoryModel.create({schoolId, name, quantity, price, dateBought})
    res.status(201).json({
        success: true,
        data: newInventory
    })
})

exports.getInventory = asyncHandler(async (req, res, next) => {
    const schoolId = req.user.id
    const inventory = await inventoryModel.find({schoolId})
    res.status(200).json({
        success: true,
        data: inventory
    })
})

exports.editInventory = asyncHandler(async (req, res, next) => {
    const {name, quantity, price, dateBought} = req.body
    const schoolId = req.user.id
    dateBought = timeFormat(dateBought,res)
    const {id} = req.params
    const inventory = await inventoryModel.findOne({name, schoolId, _id: id})

    if(!inventory){
        return next(new ErrorResponse(`Inventory with name ${name} does not exist`, 400))
    }

    const updatedInventory = await inventoryModel.findOneAndUpdate({name, schoolId}, {quantity, price, dateBought}, {new: true})

    res.status(200).json({
        success: true,
        data: updatedInventory
    })
})

exports.deleteInventory = asyncHandler(async (req, res, next) => {
    const {name} = req.body
    const schoolId = req.user.id
    const {id} = req.params 
    const inventory = await inventoryModel.findOne({name, schoolId, _id: id})

    if(!inventory){
        return next(new ErrorResponse(`Inventory with name ${name} does not exist`, 400))
    }

    await inventoryModel.findOneAndDelete({name, schoolId})

    res.status(200).json({
        success: true,
        data: {}
    })
})
