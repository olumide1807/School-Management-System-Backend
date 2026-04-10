const generateRandomId = async (schoolId, schoolModel, studentModel) => {
  const school = await schoolModel.findById(schoolId);

  // extract the school abbreviation, fallback to first 3 letters of school name or "STU"
  let abbr = school.schoolInitials;
  if (!abbr && school.schoolName) {
    abbr = school.schoolName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3);
  }
  if (!abbr) abbr = "STU";

  // generate a random number
  const randomNumber = Math.floor(1000 + Math.random() * 9000);

  // Combine school abbreviation and random number to create the student ID
  const studentId = `${abbr}/${randomNumber}`;

  // check if studentID exists in the school, and if so, re-create
  const exists = await studentModel.findOne({ studentID: studentId, schoolId });
  if (exists) {
    return generateRandomId(schoolId, schoolModel, studentModel);
  }

  return studentId;
};

module.exports = {
  generateRandomId
}