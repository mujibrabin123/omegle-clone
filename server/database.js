const mongoose = require("mongoose");
require("dotenv").config();

// 🔹 Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on("error", console.error.bind(console, "❌ MongoDB connection error:"));
db.once("open", () => console.log("✅ MongoDB Connected Successfully"));

// 🔹 Define User Schema (For Authentication & Profile Storage)
const UserSchema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true }, // Unique User ID
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  country: String,
  gender: String,
  interests: [String], // List of interests for better matching
  createdAt: { type: Date, default: Date.now },
});
const User = mongoose.model("User", UserSchema);

// 🔹 Define Chat Schema (For Storing Messages)
const ChatSchema = new mongoose.Schema({
  senderId: { type: String, required: true },
  receiverId: { type: String, required: true },
  message: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});
const Chat = mongoose.model("Chat", ChatSchema);

// 🔹 Define Ban Schema (For Moderation)
const BanSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  reason: { type: String, required: true },
  bannedAt: { type: Date, default: Date.now },
  duration: { type: Number, default: 7 }, // Ban duration in days (default 7 days)
});
const Ban = mongoose.model("Ban", BanSchema);

// 🔹 Define Preferences Schema (For Filters)
const PreferencesSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  preferredGender: String,
  preferredCountry: String,
  preferredLanguage: String,
});
const Preferences = mongoose.model("Preferences", PreferencesSchema);

// 🔹 Define Reports Schema (For User Moderation)
const ReportSchema = new mongoose.Schema({
  reporterId: { type: String, required: true },
  reportedUserId: { type: String, required: true },
  reason: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});
const Report = mongoose.model("Report", ReportSchema);

module.exports = { User, Chat, Ban, Preferences, Report };
