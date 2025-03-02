// Banned.js
import React, { useEffect, useState } from "react";
import "./banned.css";

const Banned = ({ banExpiresAt }) => {
  const [remainingTime, setRemainingTime] = useState("");

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const banTime = new Date(banExpiresAt);
      const diff = banTime - now;
      if (diff <= 0) {
        setRemainingTime("Ban expired. Please reload the page.");
        clearInterval(interval);
      } else {
        // Convert diff to days, hours, minutes, seconds.
        const days = Math.floor(diff / (24 * 3600 * 1000));
        const hours = Math.floor((diff % (24 * 3600 * 1000)) / (3600 * 1000));
        const minutes = Math.floor((diff % (3600 * 1000)) / (60 * 1000));
        const seconds = Math.floor((diff % (60 * 1000)) / 1000);
        setRemainingTime(`${days}d ${hours}h ${minutes}m ${seconds}s`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [banExpiresAt]);

  return (
    <div className="banned-overlay">
      <div className="banned-modal">
        <h2 className="banned-title">Account Banned</h2>
        <p className="banned-message">You have been banned for violating our terms.</p>
        <p className="banned-countdown">Ban lifts in: {remainingTime}</p>
      </div>
    </div>
  );
};

export default Banned;
