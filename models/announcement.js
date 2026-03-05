const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SuperAdmin',
    required: true
  },
  important: {
    type: Boolean,
    default: false
  },
  startDate: {
    type: Date,
    default: Date.now()
  },
  endDate: {
    type: Date,
    default: Date.now()
  },
  visibleTo: {
    type: [
      {
        type: String,
        enum: ["staff", "student"]
      }
    ],
    default: ["staff", "student"]
  }
}, { timestamps: true });

const Announcement = mongoose.model('Announcement', announcementSchema);

module.exports = Announcement;
