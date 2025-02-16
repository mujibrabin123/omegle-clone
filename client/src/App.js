import React, { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import SimplePeer from "simple-peer";
import "bootstrap/dist/css/bootstrap.min.css";
import "./App.css";

// Connect to your signaling server.
const socket = io("https://server-crimson-wildflower-4430.fly.dev");

function App() {
  const [partnerId, setPartnerId] = useState(null);
  const [searching, setSearching] = useState(false);
  const [interests, setInterests] = useState("");
  const [commonInterests, setCommonInterests] = useState([]);
  const [stream, setStream] = useState(null);
  const [partnerStream, setPartnerStream] = useState(null);
  const [myId, setMyId] = useState("");
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");

  const userVideo = useRef();
  const partnerVideo = useRef();
  const peerRef = useRef(null);

  useEffect(() => {
    socket.on("connect", () => {
      console.log("Connected with ID:", socket.id);
      setMyId(socket.id);
    });

    socket.on("partnerFound", ({ partnerId, commonInterests }) => {
      console.log("Partner found:", partnerId, commonInterests);
      setPartnerId(partnerId);
      setCommonInterests(commonInterests);
      setSearching(false);
    });

    socket.on("signal", ({ signal }) => {
      console.log("Signal received:", signal);
      if (peerRef.current) {
        peerRef.current.signal(signal);
      }
    });

    socket.on("partnerDisconnected", () => {
      console.log("Partner disconnected");
      setPartnerId(null);
      setCommonInterests([]);
      if (peerRef.current) {
        peerRef.current.destroy();
        peerRef.current = null;
      }
      setPartnerStream(null);
      alert("Your chat partner has disconnected.");
    });

    socket.on("receiveMessage", (message) => {
      console.log("Message received:", message);
      setMessages((prev) => [...prev, { sender: "partner", text: message }]);
    });

    return () => {
      socket.off("connect");
      socket.off("partnerFound");
      socket.off("signal");
      socket.off("partnerDisconnected");
      socket.off("receiveMessage");
    };
  }, []);

  useEffect(() => {
    if (partnerId && myId && !peerRef.current) {
      const initiator = myId < partnerId;
      console.log("Starting video chat. Initiator:", initiator);
      startVideoChat(initiator);
    }
  }, [partnerId, myId]);

  const findPartner = () => {
    setSearching(true);
    const interestList = interests.trim()
      ? interests.split(",").map((i) => i.trim().toLowerCase())
      : [];
    console.log("Finding partner with interests:", interestList);
    socket.emit("findPartner", interestList);
  };

  const startVideoChat = async (initiator) => {
    try {
      // Get video and audio stream with enhanced audio constraints.
      const userStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 2,
        },
      });
      setStream(userStream);
      if (userVideo.current) {
        userVideo.current.srcObject = userStream;
        userVideo.current.muted = true; // Mute local preview.
      }
      // Create the peer connection with your TURN server.
      const peer = new SimplePeer({
        initiator,
        trickle: false, // Disable trickle ICE for reliability.
        stream: userStream,
        config: {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            {
              urls: "turn:35.232.251.11:3478?transport=udp",
              username: "mujib.rabin",
              credential: "rabin",
            },
          ],
          // You can force relay by setting: iceTransportPolicy: "relay"
        },
      });
      peer.on("signal", (signal) => {
        console.log("Sending signal:", signal);
        socket.emit("signal", { partnerId, signal });
      });
      peer.on("stream", (remoteStream) => {
        console.log("Remote stream received. Audio tracks:", remoteStream.getAudioTracks().length);
        setPartnerStream(remoteStream);
        if (partnerVideo.current) {
          partnerVideo.current.srcObject = remoteStream;
          partnerVideo.current.muted = false;
          partnerVideo.current.volume = 1.0;
          partnerVideo.current.onloadedmetadata = () => {
            partnerVideo.current.play().catch((err) =>
              console.error("Error playing remote stream:", err)
            );
          };
        }
      });
      peer.on("error", (err) => console.error("Peer error:", err));
      peer.on("iceStateChange", (state) => console.log("ICE state:", state));
      peer.on("connect", () => console.log("Peer connected!"));
      peerRef.current = peer;
    } catch (err) {
      console.error("Error accessing media devices:", err);
    }
  };

  const sendMessage = () => {
    if (newMessage.trim() === "") return;
    socket.emit("sendMessage", newMessage);
    setMessages((prev) => [...prev, { sender: "you", text: newMessage }]);
    setNewMessage("");
  };

  const nextPartner = () => {
    setPartnerId(null);
    setCommonInterests([]);
    setPartnerStream(null);
    setMessages([]);
    setNewMessage("");
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    socket.emit("nextPartner");
    findPartner();
  };

  return (
    <div className="app-wrapper">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="branding">
          <h2>link UP</h2>
          <p>Connect based on interests</p>
        </div>
        <div className="sidebar-content">
          {!partnerId && (
            <div className="partner-search">
              <input
                type="text"
                value={interests}
                onChange={(e) => setInterests(e.target.value)}
                placeholder="Enter interests (optional)"
                className="form-control"
              />
              <button onClick={findPartner} disabled={searching} className="btn btn-primary mt-3">
                {searching ? "Searching..." : "Find a Partner"}
              </button>
            </div>
          )}
          {partnerId && (
            <div className="chat-box">
              <div className="chat-messages">
                {messages.map((msg, index) => (
                  <div key={index} className={`chat-message ${msg.sender === "you" ? "sent" : "received"}`}>
                    {msg.text}
                  </div>
                ))}
              </div>
              <div className="chat-input">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                />
                <button onClick={sendMessage} className="btn btn-outline-light">
                  Send
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Main content */}
      <div className="main-content">
        {partnerId ? (
          <>
            <div className="video-container">
              <video ref={partnerVideo} autoPlay playsInline className="partner-video" />
              <video ref={userVideo} autoPlay playsInline className="user-video-overlay" />
            </div>
            <div className="common-interests">
              <h4>Common Interests:</h4>
              <p>{commonInterests.length > 0 ? commonInterests.join(", ") : "None"}</p>
            </div>
            <div className="control-buttons-bottom">
              <button onClick={() => window.location.reload()} className="btn btn-danger btn-lg">
                Disconnect
              </button>
              <button onClick={nextPartner} className="btn btn-warning btn-lg">
                Next
              </button>
            </div>
          </>
        ) : (
          <div className="welcome-message">
            <h3>Welcome to link UP</h3>
            <p>Enter your interests and find a chat partner instantly.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
