const { parentModel } = require('../models'); // Adjust the import path as needed
const {
  getAll,
  getById,
  create,
  update,
  remove,
} = require('./crudFunctions');

const getAllParents = async () => {
  return await getAll(parentModel);
};

const getParentById = async (parentId) => {
  return await getById(parentModel, parentId);
};

const createParent = async (parentData) => {
  return await create(parentModel, parentData);
};

const updateParent = async (parentId, updatedData) => {
  return await update(parentModel, parentId, updatedData);
};

const deleteParent = async (parentId) => {
  return await remove(parentModel, parentId);
};

module.exports = {
  getAllParents,
  getParentById,
  createParent,
  updateParent,
  deleteParent,
};
