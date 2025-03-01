const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
require("dotenv").config();

const connectDB = require("./db"); // Import the connection function
const User = require("./models/User"); // Import the User model
const Report = require("./models/report"); // Import the Report model

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Connect to MongoDB
connectDB();

// In-memory store for session messages.
// Key: session key (sorted combination of two socket IDs)
// Value: array of message objects { senderUid, text, timestamp }
const sessionMessages = {};

// Store waiting users along with their interests.
let waitingUsers = [];
let activePairs = new Map();

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);
  
  // Request authentication data from the client immediately on connection.
  // This ensures that even on reconnection, the client is prompted to re-authenticate.
  socket.emit("requestUserAuthentication");

  // Listen for userAuthenticated event from the frontend
  socket.on("userAuthenticated", async (firebaseUser) => {
    console.log("Received userAuthenticated event:", firebaseUser);
    try {
      let user = await User.findOne({ firebaseUid: firebaseUser.uid });
      if (!user) {
        user = new User({
          firebaseUid: firebaseUser.uid,
          displayName: firebaseUser.displayName,
          email: firebaseUser.email,
        });
        await user.save();
        console.log("New user saved to MongoDB:", user);
      } else {
        console.log("User already exists:", user);
      }
      
      // Check if the user's ban has expired. If yes, unban them.
      if (user.isBanned && user.banExpiresAt && user.banExpiresAt < new Date()) {
        user.isBanned = false;
        user.banExpiresAt = null;
        await user.save();
        console.log("Ban expired; user unbanned:", user);
      }
      
      // Save the Firebase UID on the socket for later reference.
      socket.firebaseUid = firebaseUser.uid;
      
      // If the user is still banned, inform them and disconnect.
      if (user.isBanned) {
        socket.emit("banned", {
          message: "Your account has been banned.",
          banExpiresAt: user.banExpiresAt, // frontend can calculate remaining time
        });
        socket.disconnect();
        return;
      }
      
      socket.emit("userSaved", user);
    } catch (error) {
      console.error("Error handling user in MongoDB:", error);
    }
  });

  // Listen for reportUser event from the frontend.
  // The event expects an object: { reportedSocketId, sessionMessages (optional) }
  socket.on("reportUser", async ({ reportedSocketId, sessionMessages: clientSessionMessages }) => {
    console.log("reportUser event triggered");
    console.log("Reported socket ID:", reportedSocketId);

    // Ensure the reporter is authenticated.
    if (!socket.firebaseUid) {
      console.error("Reporter not authenticated, missing firebaseUid");
      return socket.emit("reportAcknowledged", "Report submission failed: user not authenticated.");
    }
    
    try {
      // Build session key based on the two socket IDs in sorted order.
      const sessionKey = [socket.id, reportedSocketId].sort().join("_");
      
      // Use client-provided session messages if available; otherwise, use in-memory messages.
      let messages = clientSessionMessages && clientSessionMessages.length > 0 
        ? clientSessionMessages 
        : (sessionMessages[sessionKey] || []);
      
      // If the messages from the client are simple strings, format them as objects.
      if (messages.length > 0 && typeof messages[0] === "string") {
        messages = messages.map(text => ({
          senderUid: socket.firebaseUid,
          text,
          timestamp: new Date()
        }));
      }
      
      console.log("Session key:", sessionKey, "Messages:", messages);

      // Look up the reported user's Firebase UID from connected sockets.
      let reportedFirebaseUid = null;
      io.sockets.sockets.forEach((s) => {
        if (s.id === reportedSocketId) {
          reportedFirebaseUid = s.firebaseUid;
        }
      });
      
      // Fallback: if reported user is not found, use the reportedSocketId.
      if (!reportedFirebaseUid) {
        console.warn("Reported user not found among connected sockets; using reportedSocketId as fallback.");
        reportedFirebaseUid = reportedSocketId;
      }

      // Save the report in the Reports collection (permanent storage in the DB).
      const report = new Report({
        reporterUid: socket.firebaseUid,
        reportedUid: reportedFirebaseUid,
        messages: messages,
      });
      await report.save();
      console.log("Report saved:", report);
      
      // Optionally clear session messages for this session.
      delete sessionMessages[sessionKey];
      socket.emit("reportAcknowledged", "Report submitted successfully.");

      // ----- Automatic Ban Logic -----
      // If a user accumulates 10 reports, automatically ban them for 7 days.
      const REPORT_THRESHOLD = 10;
      const reportCount = await Report.countDocuments({ reportedUid: reportedFirebaseUid });
      if (reportCount >= REPORT_THRESHOLD) {
        const banDurationMs = 7 * 24 * 3600000; // 7 days in milliseconds
        const banExpiresAt = new Date(Date.now() + banDurationMs);
        await User.findOneAndUpdate(
          { firebaseUid: reportedFirebaseUid },
          { isBanned: true, banExpiresAt }
        );
        console.log(`User with uid ${reportedFirebaseUid} automatically banned for 7 days due to excessive reports.`);
      }
    } catch (error) {
      console.error("Error processing report:", error);
      socket.emit("reportAcknowledged", "Error submitting report.");
    }
  });

  socket.on("findPartner", (userInterests) => {
    let matchedUser = null;
    // Attempt to match based on interests.
    for (let i = 0; i < waitingUsers.length; i++) {
      const waitingUser = waitingUsers[i];
      if (userInterests.length === 0 || waitingUser.interests.length === 0) {
        matchedUser = waitingUser;
        waitingUsers.splice(i, 1);
        break;
      }
      const commonInterests = waitingUser.interests.filter((interest) =>
        userInterests.includes(interest)
      );
      if (commonInterests.length > 0) {
        matchedUser = waitingUser;
        waitingUsers.splice(i, 1);
        break;
      }
    }
    if (matchedUser) {
      activePairs.set(socket.id, matchedUser.socketId);
      activePairs.set(matchedUser.socketId, socket.id);
      io.to(socket.id).emit("partnerFound", {
        partnerId: matchedUser.socketId,
        commonInterests: matchedUser.interests,
      });
      io.to(matchedUser.socketId).emit("partnerFound", {
        partnerId: socket.id,
        commonInterests: userInterests,
      });
    } else {
      waitingUsers.push({ socketId: socket.id, interests: userInterests });
    }
  });

  // Handle "Next" button: disconnect current partner & requeue.
  socket.on("nextPartner", () => {
    const partnerId = activePairs.get(socket.id);
    if (partnerId) {
      io.to(partnerId).emit("partnerDisconnected");
      activePairs.delete(partnerId);
      activePairs.delete(socket.id);
    }
    waitingUsers = waitingUsers.filter((user) => user.socketId !== socket.id);
  });

  // Handle chat messages.
  socket.on("sendMessage", (message) => {
    const partnerId = activePairs.get(socket.id);
    if (partnerId) {
      // Build session key for this pair.
      const sessionKey = [socket.id, partnerId].sort().join("_");
      if (!sessionMessages[sessionKey]) {
        sessionMessages[sessionKey] = [];
      }
      sessionMessages[sessionKey].push({
        senderUid: socket.firebaseUid,
        text: message,
        timestamp: new Date()
      });
      console.log("Updated session messages for", sessionKey, ":", sessionMessages[sessionKey]);
      // Forward the message to the partner.
      io.to(partnerId).emit("receiveMessage", message);
    }
  });

  socket.on("signal", ({ partnerId, signal }) => {
    io.to(partnerId).emit("signal", { signal, from: socket.id });
  });

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

// ----- Admin Manual Ban Endpoint -----
// This endpoint allows an admin (or your system) to manually ban a user.
// Pass in the user's firebaseUid and a banDuration (in hours).
app.post("/banUser", async (req, res) => {
  const { firebaseUid, banDuration } = req.body; // banDuration in hours (e.g., 240 for 10 days, 720 for 1 month)
  try {
    const banExpiresAt = banDuration ? new Date(Date.now() + banDuration * 3600000) : null;
    const user = await User.findOneAndUpdate(
      { firebaseUid },
      { isBanned: true, banExpiresAt },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ message: "User banned successfully", user });
  } catch (error) {
    console.error("Error banning user:", error);
    res.status(500).json({ error: "Error banning user" });
  }
});

app.get("/", (req, res) => {
  res.send("Backend is working!");
});

server.listen(PORT, "0.0.0.0", () =>
  console.log(`Server running on http://0.0.0.0:${PORT}`)
);
