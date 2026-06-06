const generateStaffId = async (schoolId, schoolModel, staffModel) => {
  const school = await schoolModel.findById(schoolId);

  // Extract school abbreviation
  let abbr = school.schoolInitials;
  if (!abbr && school.schoolName) {
    abbr = school.schoolName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3);
  }
  if (!abbr) abbr = "STF";

  // Generate a random 4-digit number
  const randomNumber = Math.floor(1000 + Math.random() * 9000);

  // Combine with "S" prefix to distinguish from student IDs
  // Format: QM/S1234 (S for Staff)
  const staffId = `${abbr}/S${randomNumber}`;

  // Check for collision
  const exists = await staffModel.findOne({ staffID: staffId, schoolId });
  if (exists) {
    return generateStaffId(schoolId, schoolModel, staffModel);
  }

  return staffId;
};

module.exports = { generateStaffId };