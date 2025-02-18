import React, { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import SimplePeer from "simple-peer";
import "bootstrap/dist/css/bootstrap.min.css";
import "./App.css";

// Importing images for the new section
import realPeopleImg from "./assets/real-people.png";
import freeImg from "./assets/free.png";
import socialImg from "./assets/social.png";
import adFreeImg from "./assets/ad-free.png";

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
      setMyId(socket.id);
    });

    socket.on("partnerFound", ({ partnerId, commonInterests }) => {
      setPartnerId(partnerId);
      setCommonInterests(commonInterests);
      setSearching(false);
    });

    socket.on("signal", ({ signal }) => {
      if (peerRef.current) {
        peerRef.current.signal(signal);
      }
    });

    socket.on("partnerDisconnected", () => {
      alert("Your chat partner has disconnected.");
      cleanupCall();
      findPartner();
    });

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

  const findPartner = () => {
    setSearching(true);
    const interestList = interests.trim()
      ? interests.split(",").map((i) => i.trim().toLowerCase())
      : [];
    socket.emit("findPartner", interestList);
  };

  const sendMessage = () => {
    if (newMessage.trim() === "") return;
    socket.emit("sendMessage", newMessage);
    setMessages((prev) => [...prev, { sender: "you", text: newMessage }]);
    setNewMessage("");
  };

  const nextPartner = () => {
    cleanupCall();
    socket.emit("nextPartner");
    findPartner();
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
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    setStream(null);
  };

  return (
    <div className={`app-wrapper ${partnerId ? "video-active" : "no-partner"}`}>
      {/* New Intro Section */}
      {!partnerId && (
        <div className="intro-section">
          <h1>Why TALKVEE is a Popular Omegle Alternative for Random Webcam Chats</h1>
          <div className="features-container">
            <div className="feature">
              <img src={realPeopleImg} alt="Real People" />
              <h3>Real People</h3>
              <p>Every webcam chat is with real users. No bots—only genuine interactions!</p>
            </div>
            <div className="feature">
              <img src={freeImg} alt="100% Free" />
              <h3>100% Free</h3>
              <p>Talk to strangers for as long as you like. No subscriptions or hidden fees!</p>
            </div>
            <div className="feature">
              <img src={socialImg} alt="Social Network" />
              <h3>Social Network</h3>
              <p>Meet new people and stay in touch with our built-in social features!</p>
            </div>
            <div className="feature">
              <img src={adFreeImg} alt="Ad-Free" />
              <h3>Ad-Free</h3>
              <p>Enjoy uninterrupted conversations without distractions.</p>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <div className="sidebar">
        <h2>TALKVEE</h2>
        <p>Connect based on interests</p>
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
      </div>

      {/* Video Section */}
      <div className="main-content">
        {partnerId ? (
          <>
            <video ref={partnerVideo} autoPlay playsInline className="partner-video" />
            <video ref={userVideo} autoPlay playsInline className="user-video-overlay" />
            <div className="common-interests">
              <h4>Common Interests:</h4>
              <p>{commonInterests.length > 0 ? commonInterests.join(", ") : "None"}</p>
            </div>
            <div className="control-buttons-bottom">
              <button onClick={() => window.location.reload()} className="btn btn-danger">
                Disconnect
              </button>
              <button onClick={nextPartner} className="btn btn-warning">
                Next
              </button>
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
