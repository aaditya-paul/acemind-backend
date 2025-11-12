// Firebase Admin SDK for backend
const admin = require("firebase-admin");

// Initialize Firebase Admin
let db = null;

function initializeFirebaseAdmin() {
  if (!admin.apps.length) {
    const projectId = process.env.FIREBASE_PROJECT_ID;

    if (!projectId) {
      throw new Error("FIREBASE_PROJECT_ID is required in .env file");
    }

    // Check if service account key is provided
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
        console.log("✅ Firebase Admin initialized with Service Account");
      } catch (error) {
        throw new Error(
          `Failed to parse FIREBASE_SERVICE_ACCOUNT: ${error.message}`
        );
      }
    } else {
      // For development: Initialize without credentials (limited functionality)
      // This will work if the backend has proper Firebase emulator or IAM setup
      console.log("⚠️  Initializing Firebase Admin without credentials");
      console.log("   For production, add FIREBASE_SERVICE_ACCOUNT to .env");
      console.log("   Analytics will use best-effort storage");

      try {
        // Try application default credentials (works on Cloud Run, GCE, etc.)
        admin.initializeApp({
          credential: admin.credential.applicationDefault(),
          projectId: projectId,
        });
        console.log(
          "✅ Firebase Admin initialized with Application Default Credentials"
        );
      } catch (error) {
        // Fallback: Initialize without credentials for local development
        // Note: This will have limited functionality
        console.log(
          "⚠️  No credentials available, initializing in limited mode"
        );
        console.log(
          "   To enable full functionality, generate a service account key:"
        );
        console.log(
          "   1. Go to Firebase Console > Project Settings > Service Accounts"
        );
        console.log("   2. Click 'Generate New Private Key'");
        console.log(
          "   3. Add to .env: FIREBASE_SERVICE_ACCOUNT='{...json content...}'"
        );

        // Initialize with minimal config for local dev
        admin.initializeApp({
          projectId: projectId,
        });
        console.log("⚠️  Running in limited mode (read-only analytics)");
      }
    }
  }

  db = admin.firestore();
  return db;
}

function getFirestoreDB() {
  if (!db) {
    return initializeFirebaseAdmin();
  }
  return db;
}

module.exports = {
  admin,
  initializeFirebaseAdmin,
  getFirestoreDB,
};
