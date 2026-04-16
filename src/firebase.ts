import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Your web app's Firebase configuration from user request
const firebaseConfig = {
  apiKey: "AIzaSyBDXua63XjIVCPF84ohjDRKI7JGkyGP_Zw",
  authDomain: "niklausgestor.firebaseapp.com",
  projectId: "niklausgestor",
  storageBucket: "niklausgestor.firebasestorage.app",
  messagingSenderId: "725321886585",
  appId: "1:725321886585:web:2be240db7be422af6c5da8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

export default app;
