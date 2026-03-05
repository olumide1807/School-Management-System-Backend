const { staffModel } = require('../models'); // Adjust the import path as needed
const {
  getAll,
  getById,
  getByEmail,
  create,
  update,
  remove,
} = require('./crudFunctions');

const getAllStaff = async () => {
  return await getAll(staffModel);
};

const getStaffById = async (staffId) => {
  return await getById(staffModel, staffId);
};

const getStaffByEmail = async (staffEmail) => {
  return await getByEmail(staffModel, staffEmail)
}

const createStaff = async (staffData) => {
  return await create(staffModel, staffData);
};

const updateStaff = async (staffId, updatedData) => {
  return await update(staffModel, staffId, updatedData);
};

const deleteStaff = async (staffId) => {
  return await remove(staffModel, staffId);
};

module.exports = {
  getAllStaff,
  getStaffById,
  getStaffByEmail,
  createStaff,
  updateStaff,
  deleteStaff,
};
