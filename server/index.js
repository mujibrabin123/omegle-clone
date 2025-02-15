const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Store waiting users along with their interests.
let waitingUsers = [];
let activePairs = new Map();

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

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
    socket.emit("findPartner", []); // requeue with an empty interest array
  });

  // Handle chat messages.
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

server.listen(PORT, "0.0.0.0", () => console.log(`Server running on http://0.0.0.0:${PORT}`));
