function updateSubjectTeacher(subject, teacher) {
  if (teacher.id !== subject.subjectTeacherId) {
    subject.subjectTeacherId = teacher.id;
    subject.save();
  }
}

module.exports = { updateSubjectTeacher }