const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
require("dotenv").config();

// 🔹 Initialize Firebase Admin SDK
const admin = require("firebase-admin");

const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});


const { User, Chat, Ban, Preferences } = require("./database"); // Import MongoDB models

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// 🔹 Middleware: Verify Firebase ID Token
const verifyToken = async (req, res, next) => {
  // Get token from the Authorization header (format: "Bearer <token>")
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Unauthorized - No token provided" });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    res.status(401).json({ error: "Unauthorized - Invalid token" });
  }
};

let waitingUsers = [];
let activePairs = new Map();

// 🔹 Test Database Operation (Fetch Users)
// Optionally, you can protect this route with verifyToken if needed
app.get("/test-db", verifyToken, async (req, res) => {
  try {
    const users = await User.find(); // Fetch all users from the DB
    res.json(users);
  } catch (error) {
    console.error("Database test error:", error);
    res.status(500).json({ message: "Error fetching data", error });
  }
});

// 🔹 Protected Route Example
app.get("/protected-route", verifyToken, (req, res) => {
  res.json({ message: "You have access!", user: req.user });
});

// 🔹 User Registration & Authentication
app.post("/register", async (req, res) => {
  const { uid, name, email, country, gender } = req.body;
  try {
    let user = await User.findOne({ uid });
    if (!user) {
      user = new User({ uid, name, email, country, gender });
      await user.save();
    }
    res.json({ success: true, user });
  } catch (error) {
    console.error("User registration error:", error);
    res.status(500).json({ error: "Failed to register user" });
  }
});

// 🔹 Handle WebSocket Connections
io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on("findPartner", async (userInterests) => {
    let matchedUser = null;
    for (let i = 0; i < waitingUsers.length; i++) {
      const waitingUser = waitingUsers[i];

      const commonInterests = waitingUser.interests.filter((interest) =>
        userInterests.includes(interest)
      );

      if (commonInterests.length > 0 || userInterests.length === 0) {
        matchedUser = waitingUser;
        waitingUsers.splice(i, 1);
        break;
      }
    }

    if (matchedUser) {
      activePairs.set(socket.id, matchedUser.socketId);
      activePairs.set(matchedUser.socketId, socket.id);

      io.to(socket.id).emit("partnerFound", { partnerId: matchedUser.socketId, commonInterests: matchedUser.interests });
      io.to(matchedUser.socketId).emit("partnerFound", { partnerId: socket.id, commonInterests: userInterests });
    } else {
      waitingUsers.push({ socketId: socket.id, interests: userInterests });
    }
  });

  // 🔹 Handle Chat Messages
  socket.on("sendMessage", async ({ senderId, receiverId, message }) => {
    try {
      const chat = new Chat({ senderId, receiverId, message });
      await chat.save();
      io.to(receiverId).emit("receiveMessage", message);
    } catch (error) {
      console.error("Chat message error:", error);
    }
  });

  // 🔹 Handle Reporting & Banning Users
  socket.on("reportUser", async ({ userId, reason }) => {
    try {
      const ban = new Ban({ userId, reason, duration: 7 }); // 7-day ban
      await ban.save();
      io.to(userId).emit("banned", "You have been banned for inappropriate behavior.");
    } catch (error) {
      console.error("Ban error:", error);
    }
  });

  // 🔹 Handle User Preferences (Filters)
  socket.on("updatePreferences", async ({ userId, gender, country, language }) => {
    try {
      await Preferences.findOneAndUpdate(
        { userId },
        { preferredGender: gender, preferredCountry: country, preferredLanguage: language },
        { upsert: true }
      );
    } catch (error) {
      console.error("Preferences update error:", error);
    }
  });

  // 🔹 Handle Disconnections
  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
    waitingUsers = waitingUsers.filter((user) => user.socketId !== socket.id);
    const partnerId = activePairs.get(socket.id);
    if (partnerId) {
      io.to(partnerId).emit("partnerDisconnected");
      activePairs.delete(partnerId);
      activePairs.delete(socket.id);
    }
  });
});

app.get("/", (req, res) => {
  res.send("Backend with MongoDB is working!");
});

// 🔹 Start Server
server.listen(PORT, "0.0.0.0", () => console.log(`✅ Server running on http://0.0.0.0:${PORT}`));
