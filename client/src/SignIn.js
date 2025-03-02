// SignIn.js
import React from "react";
import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "./firebase";
import "./SignIn.css"; // Import the updated CSS

const SignIn = ({ onSignIn }) => {
  const handleSignIn = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      onSignIn(user);
    } catch (error) {
      console.error("Error during Google sign-in:", error);
    }
  };

  return (
    <div className="signin-overlay">
      <div className="signin-modal">
        {/* App Logo Section */}
        <div className="app-logo-container">
          <img
            src="/logo192.png"  // update with your app logo URL or file if needed
            alt="App Logo"
            className="app-logo"
          />
        </div>
        {/* Title and Description */}
        <h2 className="signin-title">Become a Member</h2>
        <p className="signin-description">
          Sign in and enjoy connecting with like-minded people!
        </p>
        {/* Google Sign-In Button */}
        <button className="signin-button" onClick={handleSignIn}>
          <img
            src="https://developers.google.com/identity/images/g-logo.png"
            alt="Google Logo"
            className="google-logo"
          />
          Sign in with Google
        </button>
      </div>
    </div>
  );
};

export default SignIn;
