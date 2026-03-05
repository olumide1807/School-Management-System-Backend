const { studentModel } = require('../models'); // Adjust the import path as needed
const {
  getAll,
  getById,
  create,
  update,
  remove,
} = require('./crudFunctions');

const getAllStudents = async () => {
  return await getAll(studentModel);
};

const getStudentById = async (studentId) => {
  return await getById(studentModel, studentId);
};

const createStudent = async (studentData) => {
  return await create(studentModel, studentData);
};

const updateStudent = async (studentId, updatedData) => {
  return await update(studentModel, studentId, updatedData);
};

const deleteStudent = async (studentId) => {
  return await remove(studentModel, studentId);
};

module.exports = {
  getAllStudents,
  getStudentById,
  createStudent,
  updateStudent,
  deleteStudent,
};
