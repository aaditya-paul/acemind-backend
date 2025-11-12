# Quiz Session Migration: In-Memory → Firebase

## Problem

1. **User ID not tracked**: `/api/submit-quiz` endpoint showed "anonymous" in analytics
2. **Server restart required**: Quiz sessions stored in memory (Map) lost on restart
3. **File-based backup unreliable**: Auto-save to disk didn't solve the real-time access issue

## Solution

### 1. Enhanced User ID Extraction (analyticsMiddleware.js)

The middleware now checks multiple sources for userId:

- `req.body.userId`
- `req.body.uid`
- `req.body.user_id`
- `req.query.userId`
- `req.headers['x-user-id']`

### 2. Firebase-Based Session Storage (quizSessionManager.js)

Created a new module with functions:

- `storeQuizSession()` - Store quiz in Firebase with auto-expiry
- `getQuizSession()` - Retrieve quiz, auto-check expiry
- `deleteQuizSession()` - Clean up after submission
- `cleanupExpiredSessions()` - Auto-cleanup every 15 minutes
- `getUserQuizSessions()` - Get all active sessions for a user

### 3. Updated Endpoints (index.js)

#### `/api/generate-quiz`

**Before:**

```javascript
quizSessions.set(sessionId, {...});
saveSessions(); // Save to file
```

**After:**

```javascript
await storeQuizSession(
  sessionId,
  {
    questions,
    userId: req.body.userId || "anonymous",
    startTime,
    timeLimit,
    sessionHash,
    topic,
    difficulty,
  },
  expiryMinutes
);
```

#### `/api/submit-quiz`

**Before:**

```javascript
const session = quizSessions.get(sessionId);
quizSessions.delete(sessionId);
saveSessions();
```

**After:**

```javascript
const session = await getQuizSession(sessionId);
await deleteQuizSession(sessionId);
```

## Benefits

✅ **No server restart needed** - Sessions stored in Firebase, accessible immediately
✅ **Proper user tracking** - userId now captured and shown in analytics
✅ **Auto-expiry** - Sessions automatically expire and clean up
✅ **Scalable** - Multiple server instances can share session data
✅ **Reliable** - Firebase handles persistence, replication, and backups

## Firestore Structure

```
quizSessions/
  └── {sessionId}/
      ├── questions: Array<Question>
      ├── userId: string
      ├── startTime: number
      ├── timeLimit: number
      ├── sessionHash: string
      ├── topic: string
      ├── difficulty: string
      ├── createdAt: number
      └── expiresAt: number
```

## Frontend Changes Required

The frontend needs to send `userId` in the `/api/submit-quiz` request:

```javascript
const response = await fetch("/api/submit-quiz", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    sessionId,
    sessionHash,
    userAnswers,
    submitTime: Date.now(),
    userId: currentUser.uid, // ADD THIS
  }),
});
```

## Migration Notes

- Old file-based sessions (`quiz-sessions.json`) can be deleted
- No data migration needed - new sessions will use Firebase automatically
- Old in-memory sessions will be lost on restart (as before), but won't matter going forward
