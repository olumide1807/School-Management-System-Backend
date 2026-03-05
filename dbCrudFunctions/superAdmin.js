const { SuperAdminModel } = require('../models'); 
const {
  getAll,
  getById,
  create,
  update,
  remove,
} = require('./crudFunctions');

const getAllSuperAdmins = async () => {
  return await getAll(SuperAdminModel);
};

const getSuperAdminById = async (superAdminId) => {
  return await getById(SuperAdminModel, superAdminId);
};

const createSuperAdmin = async (superAdminData) => {
  return await create(SuperAdminModel, superAdminData);
};

const updateSuperAdmin = async (superAdminId, updatedData) => {
  return await update(SuperAdminModel, superAdminId, updatedData);
};

const deleteSuperAdmin = async (superAdminId) => {
  return await remove(SuperAdminModel, superAdminId);
};

module.exports = {
  getAllSuperAdmins,
  getSuperAdminById,
  createSuperAdmin,
  updateSuperAdmin,
  deleteSuperAdmin,
};
