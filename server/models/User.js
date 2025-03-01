// models/User.js
const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  firebaseUid: { type: String, required: true, unique: true },
  displayName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  isBanned: { type: Boolean, default: false },
  banExpiresAt: { type: Date, default: null }, // New field for ban expiration
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("User", UserSchema);
