require("dotenv").config();
const admin = require("firebase-admin");

console.log("🔧 AceMind Analytics - Firebase Setup Helper\n");

// Check if Firebase credentials are configured
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.log("✅ FIREBASE_SERVICE_ACCOUNT found in .env");
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    console.log(`   Project ID: ${serviceAccount.project_id}`);
    console.log(`   Client Email: ${serviceAccount.client_email}`);
  } catch (error) {
    console.log("❌ Error parsing FIREBASE_SERVICE_ACCOUNT:", error.message);
    console.log("   Make sure it's a valid JSON string");
  }
} else if (process.env.FIREBASE_PROJECT_ID) {
  console.log("✅ FIREBASE_PROJECT_ID found in .env");
  console.log(`   Project ID: ${process.env.FIREBASE_PROJECT_ID}`);
  console.log("   Using application default credentials");
} else {
  console.log("❌ No Firebase configuration found!");
  console.log("\nSetup Instructions:");
  console.log("─────────────────────────────────────────────────────────");
  console.log(
    "1. Go to Firebase Console: https://console.firebase.google.com/"
  );
  console.log("2. Select your project");
  console.log("3. Go to: Project Settings > Service Accounts");
  console.log('4. Click "Generate New Private Key"');
  console.log("5. Download the JSON file");
  console.log("6. Copy the entire JSON content");
  console.log("7. Add to .env file:");
  console.log('   FIREBASE_SERVICE_ACCOUNT=\'{"type":"service_account",...}\'');
  console.log("\n   OR use Project ID only:");
  console.log("   FIREBASE_PROJECT_ID=your-project-id");
  console.log("─────────────────────────────────────────────────────────\n");
  process.exit(1);
}

// Try to initialize Firebase
console.log("\n🚀 Attempting to initialize Firebase Admin SDK...\n");

try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } else {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID,
    });
  }

  const db = admin.firestore();

  console.log("✅ Firebase Admin SDK initialized successfully!");
  console.log("✅ Firestore connection established");

  // Test write
  console.log("\n📝 Testing Firestore write access...");
  const testRef = db.collection("analytics").doc("test");
  testRef
    .set({
      message: "Analytics system test",
      timestamp: Date.now(),
    })
    .then(() => {
      console.log("✅ Write test successful!");
      console.log("✅ Analytics system is ready to use\n");
      console.log("🎉 Setup Complete!");
      console.log("─────────────────────────────────────────────────────────");
      console.log("You can now start the server with: node index.js");
      console.log(
        "─────────────────────────────────────────────────────────\n"
      );
      process.exit(0);
    })
    .catch((error) => {
      console.log("❌ Write test failed:", error.message);
      console.log("\nPossible issues:");
      console.log("- Check Firestore Security Rules");
      console.log("- Verify service account has Firestore permissions");
      console.log(
        "- Enable Firestore in Firebase Console if not already done\n"
      );
      process.exit(1);
    });
} catch (error) {
  console.log("❌ Firebase initialization failed:", error.message);
  console.log("\nPlease check:");
  console.log("1. Your .env file configuration");
  console.log("2. JSON format of FIREBASE_SERVICE_ACCOUNT");
  console.log("3. Firebase project settings\n");
  process.exit(1);
}
