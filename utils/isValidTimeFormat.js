const moment = require("moment");

exports.isValidTimeFormat = (time) => moment(time, "h:mmA", true).isValid();