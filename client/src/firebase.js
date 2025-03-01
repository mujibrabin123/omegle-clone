// firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCK1pdvlEvD4z-FjQHD17xp7r82ZxO3eD8",
  authDomain: "talkvee-c046f.firebaseapp.com",
  projectId: "talkvee-c046f",
  storageBucket: "talkvee-c046f.firebasestorage.app",
  messagingSenderId: "212654275763",
  appId: "1:212654275763:web:48a29908e13c1d13fe04c6",
  measurementId: "G-KBQSQ15KF3"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Explicitly set auth persistence to local storage to maintain user sessions
setPersistence(auth, browserLocalPersistence)
  .then(() => {
    console.log("Firebase auth persistence set to local.");
  })
  .catch((error) => {
    console.error("Error setting Firebase auth persistence:", error);
  });

const googleProvider = new GoogleAuthProvider();

export { auth, googleProvider };

