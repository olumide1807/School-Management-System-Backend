const moment = require("moment");

function getMoments(startTimeFormatted, endTimeFormatted, periodTime) {
  return {
    startTimeMoment: moment(startTimeFormatted, "h:mmA"),
    endTimeMoment: moment(endTimeFormatted, "h:mmA"),
    periodStartTimeMoment: moment(periodTime.startTimeOfTheDay, "h:mmA"),
    periodEndTimeMoment: moment(periodTime.endTimeOfTheDay, "h:mmA"),
  };
}

module.exports = { getMoments };