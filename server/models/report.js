// models/Report.js
const mongoose = require("mongoose");

const ReportSchema = new mongoose.Schema({
  reporterUid: { type: String, required: true },
  reportedUid: { type: String, required: true },
  messages: [
    {
      senderUid: { type: String, required: true },
      text: { type: String, required: true },
      timestamp: { type: Date, default: Date.now },
    },
  ],
  reportedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Report", ReportSchema);
