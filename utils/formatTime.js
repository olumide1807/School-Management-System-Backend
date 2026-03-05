const moment = require("moment");
const ErrorResponse = require("../utils/errorResponse");
const { isValidTimeFormat } = require("../utils/isValidTimeFormat");

function formatTime(startTime, endTime) {
  const format = (time) =>
    isValidTimeFormat(time) ? moment(time, "h:mmA").format("h:mmA") : null;
  return [format(startTime), format(endTime)];
}

const timeFormat = (timeToFormat)=>{

  const dateObject = moment(timeToFormat, 'DD MM YYYY')

  if(dateObject.isValid()){

    return true

  }
  else {

    return false
  }
}

const changeTimeFormat = (timeToFormat)=>{
  const dateObject = moment(timeToFormat, 'YYYY MM DD')

  if(dateObject.isValid()){

    return dateObject.toDate()

  }
  else {
    return null 
  }
}


const checkAscendingOrder = (dates) =>{
  for (let i = 0; i < dates.length - 1; i++) {
      if (dates[i] > dates[i + 1]) {
          return false          
      }
  }
  return true;
}

module.exports = {
  formatTime, timeFormat, checkAscendingOrder, changeTimeFormat
};

