// Firebase Web App Configuration
// Replace these placeholders with your actual credentials from the Firebase Console (Settings > Project settings)
export const firebaseConfig = {
    apiKey: "YOUR_API_KEY_HERE",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Auto-detect if the user has replaced the default credentials
export const isFirebaseConfigured = () => {
    return firebaseConfig.apiKey && 
           firebaseConfig.apiKey !== "YOUR_API_KEY_HERE" && 
           firebaseConfig.projectId !== "YOUR_PROJECT_ID";
};
