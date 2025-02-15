import React, { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import SimplePeer from "simple-peer";
import "bootstrap/dist/css/bootstrap.min.css";

const socket = io("https://server-crimson-wildflower-4430.fly.dev");

function App() {
  const [partnerId, setPartnerId] = useState(null);
  const [searching, setSearching] = useState(false);
  const [interests, setInterests] = useState("");
  const [commonInterests, setCommonInterests] = useState([]);
  const [stream, setStream] = useState(null);
  const [partnerStream, setPartnerStream] = useState(null);
  // Capture our own socket ID.
  const [myId, setMyId] = useState("");
  
  // Chat state.
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");

  const userVideo = useRef();
  const partnerVideo = useRef();
  const peerRef = useRef(null);

  useEffect(() => {
    // Capture our socket ID.
    socket.on("connect", () => {
      setMyId(socket.id);
    });

    socket.on("partnerFound", ({ partnerId, commonInterests }) => {
      setPartnerId(partnerId);
      setCommonInterests(commonInterests);
      setSearching(false);
    });

    socket.on("signal", ({ signal, from }) => {
      if (peerRef.current) {
        peerRef.current.signal(signal);
      }
    });

    socket.on("partnerDisconnected", () => {
      setPartnerId(null);
      setCommonInterests([]);
      if (peerRef.current) {
        peerRef.current.destroy();
        peerRef.current = null;
      }
      setPartnerStream(null);
      alert("Your chat partner has disconnected.");
    });
    
    // Listen for incoming chat messages.
    socket.on("receiveMessage", (message) => {
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

  // When both our socket ID and the partner's ID are available, start the video chat.
  useEffect(() => {
    if (partnerId && myId && !peerRef.current) {
      const initiator = myId < partnerId;
      startVideoChat(initiator);
    }
  }, [partnerId, myId]);

  // Interests are optional.
  const findPartner = () => {
    setSearching(true);
    const interestList = interests.trim()
      ? interests.split(",").map((i) => i.trim().toLowerCase())
      : [];
    socket.emit("findPartner", interestList);
  };

  // Updated startVideoChat: Using trickle disabled and forcing relay via iceTransportPolicy.
  const startVideoChat = async (initiator) => {
    try {
      const userStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      setStream(userStream);
      if (userVideo.current) {
        userVideo.current.srcObject = userStream;
      }
      const peer = new SimplePeer({
        initiator,
        trickle: false, // Disable trickle ICE
        stream: userStream,
        config: {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { 
              urls: "turn:numb.viagenie.ca",
              username: "webrtc@live.com",
              credential: "muazkh"
            }
          ],
          iceTransportPolicy: "relay"  // Force relay (TURN) if necessary.
        },
      });
      peer.on("signal", (signal) => {
        socket.emit("signal", { partnerId, signal });
      });
      peer.on("stream", (remoteStream) => {
        setPartnerStream(remoteStream);
        if (partnerVideo.current) {
          partnerVideo.current.srcObject = remoteStream;
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
    <div className="container text-center mt-5">
      <h2 className="mb-4">link UP - Interest Matching</h2>
      {!partnerId ? (
        <div className="card p-4 shadow">
          <input
            type="text"
            value={interests}
            onChange={(e) => setInterests(e.target.value)}
            placeholder="Enter interests (comma-separated) – optional"
            className="form-control"
          />
          <button onClick={findPartner} disabled={searching} className="btn btn-primary mt-3">
            {searching ? "Searching..." : "Find a Partner"}
          </button>
          {searching && <p className="text-muted mt-2">Looking for a chat partner...</p>}
        </div>
      ) : (
        <>
          <h4 className="mt-4">Common Interests:</h4>
          <p className="text-muted">
            {commonInterests.length > 0 ? commonInterests.join(", ") : "No common interests"}
          </p>
          <div className="row mt-4">
            <div className="col-md-6">
              <h5>Your Video</h5>
              <video ref={userVideo} autoPlay playsInline className="w-100 border border-primary rounded" />
            </div>
            <div className="col-md-6">
              <h5>Partner's Video</h5>
              <video ref={partnerVideo} autoPlay playsInline className="w-100 border border-danger rounded" />
            </div>
          </div>
          {/* Chat Box */}
          <div className="card mt-4 p-3">
            <h5>Chat</h5>
            <div style={{ height: "150px", overflowY: "scroll", border: "1px solid #ccc", padding: "5px", marginBottom: "10px" }}>
              {messages.map((msg, index) => (
                <div key={index} className={msg.sender === "you" ? "text-end" : "text-start"}>
                  <span className={msg.sender === "you" ? "badge bg-primary" : "badge bg-secondary"}>
                    {msg.text}
                  </span>
                </div>
              ))}
            </div>
            <div className="input-group">
              <input
                type="text"
                className="form-control"
                placeholder="Type a message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
              />
              <button className="btn btn-outline-primary" onClick={sendMessage}>
                Send
              </button>
            </div>
          </div>
          <div className="d-flex justify-content-center gap-3 mt-4">
            <button onClick={() => window.location.reload()} className="btn btn-danger">
              Disconnect
            </button>
            <button onClick={nextPartner} className="btn btn-warning">
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default App;
