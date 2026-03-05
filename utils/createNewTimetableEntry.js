const { timeTableModel } = require("../models");
const ErrorResponse = require("../utils/errorResponse");

async function createNewTimetableEntry(data, timetableEntryExists, next) {
  if (timetableEntryExists) {
    return next(
      new ErrorResponse(`The timetable entry has already been created! 😢`, 400)
    );
  }

  const newTimetableEntry = new timeTableModel(data);
  await newTimetableEntry.save();
  return newTimetableEntry;
}

module.exports = { createNewTimetableEntry }