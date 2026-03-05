function updateTimetableEntry(
  timetableEntry,
  daysOfTheWeek,
  startTimeFormatted,
  endTimeFormatted,
  periodTimeId
) {
  timetableEntry.daysOfTheWeek = daysOfTheWeek;
  timetableEntry.startTime = startTimeFormatted;
  timetableEntry.endTime = endTimeFormatted;
  timetableEntry.periodTimeId = periodTimeId;
  timetableEntry.save();
}

module.exports = { updateTimetableEntry };