import React, { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import SimplePeer from "simple-peer";
import "bootstrap/dist/css/bootstrap.min.css";
import "./App.css";

// Use your server URL.
const backendUrl =
  window.location.hostname === "localhost"
    ? "http://localhost:3000"
    : "https://server-crimson-wildflower-4430.fly.dev";
const socket = io(backendUrl);

function App() {
  const [partnerId, setPartnerId] = useState(null);
  const [searching, setSearching] = useState(false);
  const [interests, setInterests] = useState("");
  const [commonInterests, setCommonInterests] = useState([]);
  // We store the local stream once granted so we don't ask permission twice.
  const [stream, setStream] = useState(null);
  const [partnerStream, setPartnerStream] = useState(null);
  const [myId, setMyId] = useState("");
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  // Toggle chat overlay on mobile
  const [showChat, setShowChat] = useState(false);
  // Camera facing: "user" (front) or "environment" (back)
  const [cameraFacing, setCameraFacing] = useState("user");
  // Loading indicator for remote stream
  const [videoLoading, setVideoLoading] = useState(false);
  // Ref to skip disconnect alert if Next is triggered
  const skipDisconnectAlertRef = useRef(false);

  const userVideo = useRef();
  const partnerVideo = useRef();
  const peerRef = useRef(null);
  // Ref to store the local video sender for track replacement
  const videoSenderRef = useRef(null);

  // Set the --vh variable for dynamic viewport height
  useEffect(() => {
    const setVh = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty("--vh", `${vh}px`);
    };
    setVh();
    window.addEventListener("resize", setVh);
    return () => window.removeEventListener("resize", setVh);
  }, []);

  // Preinitialize the camera stream once on mount to warm up the camera.
  // This will request permission once and save the stream for later use.
  useEffect(() => {
    async function preInitialize() {
      try {
        // If we already have a stream, do not request again.
        if (!stream) {
          const preStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: cameraFacing },
            audio: false,
          });
          setStream(preStream);
          if (userVideo.current) {
            userVideo.current.srcObject = preStream;
            userVideo.current.style.transform = "scaleX(1)";
            userVideo.current.muted = true;
          }
        }
      } catch (e) {
        console.error("Preinitialize error:", e);
      }
    }
    preInitialize();
  }, [cameraFacing, stream]);

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
      setVideoLoading(true);
    });

    socket.on("signal", ({ signal }) => {
      console.log("Signal received:", signal);
      if (peerRef.current) {
        peerRef.current.signal(signal);
      }
    });

    socket.on("partnerDisconnected", () => {
      console.log("Partner disconnected");
      if (skipDisconnectAlertRef.current) {
        skipDisconnectAlertRef.current = false;
      } else {
        alert("Your chat partner has disconnected.");
      }
      cleanupCall();
      findPartner();
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

  // Start the call if partnerId is set and peer hasn't been created yet.
  useEffect(() => {
    if (partnerId && myId && !peerRef.current) {
      const initiator = myId < partnerId;
      console.log("Starting video chat. Initiator:", initiator);
      startVideoChat(initiator);
    }
  }, [partnerId, myId, cameraFacing]);

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
      // Use the preinitialized stream if available, else request one.
      const localStream = stream
        ? stream
        : await navigator.mediaDevices.getUserMedia({
            video: { facingMode: cameraFacing },
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              sampleRate: 48000,
              channelCount: 2,
            },
          });
      if (!stream) setStream(localStream);
      if (userVideo.current) {
        userVideo.current.srcObject = localStream;
        userVideo.current.style.transform = "scaleX(1)";
        userVideo.current.muted = true;
      }
      const peer = new SimplePeer({
        initiator,
        trickle: true, // Enable trickle ICE for faster connection
        stream: localStream,
        config: {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            // TURN server using UDP (first priority)
            {
              urls: "turn:35.232.251.11:3478?transport=udp",
              username: "mujib.rabin",
              credential: "rabin",
            },
            // TURN server fallback using TCP
            {
              urls: "turn:35.232.251.11:3478?transport=tcp",
              username: "mujib.rabin",
              credential: "rabin",
            },
            // TURN server fallback using TLS (typically port 5349)
            {
              urls: "turns:35.232.251.11:5349",
              username: "mujib.rabin",
              credential: "rabin",
            },
          ],
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
            partnerVideo.current
              .play()
              .catch((err) => console.error("Error playing remote stream:", err));
            setVideoLoading(false);
          };
        }
      });
      peer.on("connect", () => {
        console.log("Peer connected!");
        const videoSender = peer._pc.getSenders().find((s) => s.track && s.track.kind === "video");
        videoSenderRef.current = videoSender || null;
      });
      peer.on("error", (err) => console.error("Peer error:", err));
      peer.on("iceStateChange", (state) => console.log("ICE state:", state));
      peerRef.current = peer;
    } catch (err) {
      console.error("Error accessing media devices:", err);
    }
  };

  // Replace the local video track without restarting the call
  const replaceLocalTrack = async () => {
    if (!peerRef.current) return;
    const newStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: cameraFacing },
      audio: false,
    });
    const newVideoTrack = newStream.getVideoTracks()[0];
    if (videoSenderRef.current && newVideoTrack) {
      await videoSenderRef.current.replaceTrack(newVideoTrack);
      if (userVideo.current) {
        userVideo.current.srcObject = newStream;
        userVideo.current.style.transform = "scaleX(1)";
        userVideo.current.muted = true;
      }
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      setStream(newStream);
    }
  };

  const cleanupCall = () => {
    setPartnerId(null);
    setCommonInterests([]);
    setPartnerStream(null);
    setMessages([]);
    setNewMessage("");
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    videoSenderRef.current = null;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    setStream(null);
  };

  const sendMessage = () => {
    if (newMessage.trim() === "") return;
    socket.emit("sendMessage", newMessage);
    setMessages((prev) => [...prev, { sender: "you", text: newMessage }]);
    setNewMessage("");
  };

  const nextPartner = () => {
    skipDisconnectAlertRef.current = true;
    cleanupCall();
    socket.emit("nextPartner");
    findPartner();
  };

  const toggleCamera = async () => {
    const newFacing = cameraFacing === "user" ? "environment" : "user";
    setCameraFacing(newFacing);
    if (peerRef.current) {
      await replaceLocalTrack();
    } else {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      await startVideoChat(true);
    }
  };

  return (
    <div className={`app-wrapper ${partnerId ? "video-active" : "no-partner"}`}>
      {/* Sidebar (visible when no partner is set) */}
      <div className="sidebar">
        <div className="branding">
          <h2>TALKVEE</h2>
          <p>Connect based on interests</p>
        </div>
        <div className="sidebar-content">
          {!partnerId && (
            <div className="partner-search">
              <input
                type="text"
                value={interests}
                onChange={(e) => setInterests(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    findPartner();
                  }
                }}
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
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      sendMessage();
                    }
                  }}
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
      {/* End Sidebar */}

      {/* Main content */}
      <div className="main-content">
        {partnerId ? (
          <>
            <div className="video-container">
              {videoLoading && (
                <div className="loading-overlay">
                  <div className="loader">
                    <div></div>
                    <div></div>
                  </div>
                </div>
              )}
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
            {/* Small transparent switch camera icon in host area */}
            <button className="switch-camera" onClick={toggleCamera}>
              &#8635;
            </button>
            {/* Chat toggle button (visible on mobile via CSS) */}
            <button className="chat-toggle" onClick={() => setShowChat((prev) => !prev)}>
              {showChat ? "Hide Chat" : "Show Chat"}
            </button>
            {/* Chat overlay for mobile */}
            <div className={`chat-overlay ${showChat ? "active" : ""}`}>
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
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      sendMessage();
                    }
                  }}
                  placeholder="Type a message..."
                />
                <button onClick={sendMessage}>Send</button>
              </div>
            </div>
          </>
        ) : (
          <div className="welcome-message">
            <h3>Welcome to TALKVEE</h3>
            <p>MAY CONTAIN WEIRD BUT FUN PEOPLE.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
