// Quiz Session Manager - Firebase-backed storage for quiz sessions
const { getFirestoreDB } = require("./firebaseAdmin");

/**
 * Store quiz session in Firestore
 * @param {string} sessionId - Unique session ID
 * @param {Object} sessionData - Session data (questions, userId, startTime, etc.)
 * @param {number} expiryMinutes - Session expiry time in minutes (default: 60)
 */
async function storeQuizSession(sessionId, sessionData, expiryMinutes = 60) {
  try {
    const db = getFirestoreDB();
    const expiresAt = Date.now() + expiryMinutes * 60 * 1000;

    await db
      .collection("quizSessions")
      .doc(sessionId)
      .set({
        ...sessionData,
        sessionId,
        createdAt: Date.now(),
        expiresAt,
      });

    console.log(`💾 Quiz session ${sessionId} stored in Firebase`);
    return true;
  } catch (error) {
    console.error("❌ Error storing quiz session:", error.message);
    throw error;
  }
}

/**
 * Retrieve quiz session from Firestore
 * @param {string} sessionId - Session ID to retrieve
 * @returns {Object|null} Session data or null if not found/expired
 */
async function getQuizSession(sessionId) {
  try {
    const db = getFirestoreDB();
    const sessionDoc = await db.collection("quizSessions").doc(sessionId).get();

    if (!sessionDoc.exists) {
      console.log(`⚠️  Quiz session ${sessionId} not found`);
      return null;
    }

    const session = sessionDoc.data();

    // Check if session has expired
    if (session.expiresAt && Date.now() > session.expiresAt) {
      console.log(`⏰ Quiz session ${sessionId} has expired`);
      // Clean up expired session
      await deleteQuizSession(sessionId);
      return null;
    }

    console.log(`✅ Retrieved quiz session ${sessionId} from Firebase`);
    return session;
  } catch (error) {
    console.error("❌ Error retrieving quiz session:", error.message);
    throw error;
  }
}

/**
 * Delete quiz session from Firestore
 * @param {string} sessionId - Session ID to delete
 */
async function deleteQuizSession(sessionId) {
  try {
    const db = getFirestoreDB();
    await db.collection("quizSessions").doc(sessionId).delete();
    console.log(`🗑️  Quiz session ${sessionId} deleted from Firebase`);
    return true;
  } catch (error) {
    console.error("❌ Error deleting quiz session:", error.message);
    throw error;
  }
}

/**
 * Update quiz session in Firestore (for partial updates)
 * @param {string} sessionId - Session ID to update
 * @param {Object} updates - Fields to update
 */
async function updateQuizSession(sessionId, updates) {
  try {
    const db = getFirestoreDB();
    await db
      .collection("quizSessions")
      .doc(sessionId)
      .update({
        ...updates,
        updatedAt: Date.now(),
      });
    console.log(`📝 Quiz session ${sessionId} updated in Firebase`);
    return true;
  } catch (error) {
    console.error("❌ Error updating quiz session:", error.message);
    throw error;
  }
}

/**
 * Clean up expired quiz sessions (run periodically)
 * @returns {number} Number of sessions deleted
 */
async function cleanupExpiredSessions() {
  try {
    const db = getFirestoreDB();
    const now = Date.now();

    const expiredSessions = await db
      .collection("quizSessions")
      .where("expiresAt", "<=", now)
      .get();

    const deletePromises = expiredSessions.docs.map((doc) => doc.ref.delete());

    await Promise.all(deletePromises);

    console.log(`🧹 Cleaned up ${expiredSessions.size} expired quiz sessions`);
    return expiredSessions.size;
  } catch (error) {
    console.error("❌ Error cleaning up expired sessions:", error.message);
    return 0;
  }
}

/**
 * Get all active sessions for a user
 * @param {string} userId - User ID
 * @returns {Array} Array of active quiz sessions
 */
async function getUserQuizSessions(userId) {
  try {
    const db = getFirestoreDB();
    const now = Date.now();

    const userSessions = await db
      .collection("quizSessions")
      .where("userId", "==", userId)
      .where("expiresAt", ">", now)
      .orderBy("expiresAt", "desc")
      .get();

    const sessions = userSessions.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    console.log(
      `📋 Found ${sessions.length} active sessions for user ${userId}`
    );
    return sessions;
  } catch (error) {
    console.error("❌ Error getting user quiz sessions:", error.message);
    return [];
  }
}

// Auto-cleanup expired sessions every 15 minutes
setInterval(() => {
  cleanupExpiredSessions().catch((error) =>
    console.error("Error in auto-cleanup:", error)
  );
}, 15 * 60 * 1000);

module.exports = {
  storeQuizSession,
  getQuizSession,
  deleteQuizSession,
  updateQuizSession,
  cleanupExpiredSessions,
  getUserQuizSessions,
};
