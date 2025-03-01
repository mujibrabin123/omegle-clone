const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
require("dotenv").config();

const connectDB = require("./db"); // Import the connection function
const User = require("./models/User"); // Import the User model
const Report = require("./models/report"); // Import the Report model (create models/Report.js)

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

// Store waiting users along with their interests.
let waitingUsers = [];
let activePairs = new Map();

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

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
      
      // Save the Firebase UID on the socket for later reference.
      socket.firebaseUid = firebaseUser.uid;
      
      // Check if the user is banned (if they were banned previously)
      if (user.isBanned) {
        socket.emit("banned", "Your account has been banned.");
        socket.disconnect();
        return;
      }
      
      socket.emit("userSaved", user);
    } catch (error) {
      console.error("Error handling user in MongoDB:", error);
    }
  });

  // Listen for reportUser event from the frontend.
  // The event expects an object: { reportedSocketId, sessionMessages }
  socket.on("reportUser", async ({ reportedSocketId, sessionMessages }) => {
    console.log(`Received report for socket: ${reportedSocketId}`);
    try {
      // Look up the reported user's Firebase UID from connected sockets.
      let reportedFirebaseUid = null;
      io.sockets.sockets.forEach((s) => {
        if (s.id === reportedSocketId) {
          reportedFirebaseUid = s.firebaseUid;
        }
      });
      if (reportedFirebaseUid) {
        // Save the report in the Reports collection.
        const report = new Report({
          reporterUid: socket.firebaseUid,
          reportedUid: reportedFirebaseUid,
          messages: sessionMessages, // messages exchanged during the session
        });
        await report.save();
        console.log("Report saved:", report);
        socket.emit("reportAcknowledged", "Report submitted successfully.");
      } else {
        socket.emit("reportAcknowledged", "Could not find reported user.");
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
      // If either user has no interests, match immediately.
      if (userInterests.length === 0 || waitingUser.interests.length === 0) {
        matchedUser = waitingUser;
        waitingUsers.splice(i, 1);
        break;
      }
      // Otherwise, check for common interests.
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

      // Inform both users about the match.
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

  // Handle chat messages (messages are simply forwarded; report system handles inappropriate content).
  socket.on("sendMessage", (message) => {
    const partnerId = activePairs.get(socket.id);
    if (partnerId) {
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

app.get("/", (req, res) => {
  res.send("Backend is working!");
});

server.listen(PORT, "0.0.0.0", () =>
  console.log(`Server running on http://0.0.0.0:${PORT}`)
);
