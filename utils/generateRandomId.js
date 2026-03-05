const generateRandomId = async (schoolId, schoolModel, studentModel) => {
  const school = await schoolModel.findById(schoolId);

  // extract the school abbreviation
  const abbr = school.schoolInitials;

  // generate a random number
  const randomNumber = Math.floor(1000 + Math.random() * 9000);

  // Combine school abbreviation and random number to create the student ID
  const studentId = `${abbr}${randomNumber}`;

  // check if studentID exists in the school, and if so, re-create
  await check(studentModel, studentId, schoolId);

  return studentId;
};

const check = async(model, studentId, schoolId) => {
  const exist = await model.findOne({
    studentID: studentId,
    schoolId
  });

  if (exist) {
    await check(model, studentId, schoolId);
  }
};

module.exports = {
  generateRandomId
}