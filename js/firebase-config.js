// Firebase Web App Configuration
// Replace these placeholders with your actual credentials from the Firebase Console (Settings > Project settings)
export const firebaseConfig = {
  apiKey: "AIzaSyCtunKH5Ji8NX94JDccF_scNQb41q4BBlY",
  authDomain: "chaishotts.firebaseapp.com",
  projectId: "chaishotts",
  storageBucket: "chaishotts.firebasestorage.app",
  messagingSenderId: "263412167236",
  appId: "1:263412167236:web:7cfaffaaa3a7727fc28211",
  measurementId: "G-7XNN124JP4"
};

// Auto-detect if the user has replaced the default credentials
export const isFirebaseConfigured = () => {
    return firebaseConfig.apiKey && 
           firebaseConfig.apiKey !== "YOUR_API_KEY_HERE" && 
           firebaseConfig.projectId !== "YOUR_PROJECT_ID";
};
