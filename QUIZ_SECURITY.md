# Quiz Security Implementation

## Overview

This document describes the security measures implemented to prevent manipulation of quiz answers, timing, and scoring through browser DevTools or other client-side methods.

## Security Features

### 1. **Server-Side Answer Storage**

- ✅ Correct answers are **NEVER sent to the client**
- ✅ Questions sent to frontend are sanitized (no `correctAnswer` or `explanation` fields)
- ✅ Full questions with answers stored server-side in quiz sessions

### 2. **Server-Side Timing Validation**

- ✅ Start time recorded server-side when quiz is generated
- ✅ Submit time validated with 5-second grace period for network lag
- ✅ Session hash prevents time manipulation

### 3. **Server-Side Scoring**

- ✅ All scoring calculations happen on the server
- ✅ Client cannot manipulate score or results
- ✅ Explanations only returned after submission with correct answers

### 4. **Session Security**

- ✅ Each quiz attempt gets a unique session ID
- ✅ SHA-256 hash ties session to specific parameters (quiz ID, start time, time limit)
- ✅ Sessions expire 5 minutes after time limit
- ✅ Hash validation prevents session hijacking or replay attacks

## How It Works

### Quiz Generation Flow

```
1. Client requests quiz → POST /api/generate-quiz
   - Sends: topic, difficulty, questionCount, timeLimit, userId

2. Server generates questions with AI

3. Server creates secure session:
   - sessionId (unique identifier)
   - sessionHash (SHA-256 of sessionId + startTime + timeLimit + SECRET_KEY)
   - startTime (timestamp)
   - Stores full questions with answers

4. Server sends to client:
   - Sanitized questions (NO correct answers)
   - sessionId, sessionHash, startTime, timeLimit

5. Client displays quiz with timer
```

### Quiz Submission Flow

```
1. Client submits answers → POST /api/submit-quiz
   - Sends: sessionId, sessionHash, userAnswers[], submitTime

2. Server validates:
   ✓ Session exists and not expired
   ✓ Session hash matches
   ✓ Time taken ≤ timeLimit + 5 seconds
   ✓ Answer format is valid

3. Server calculates score:
   - Compares userAnswers with stored correctAnswers
   - Counts correct/wrong answers
   - Calculates percentage

4. Server returns:
   - Score, correctAnswers, wrongAnswers
   - Detailed mistakes with explanations
   - Actual time taken

5. Session is deleted (one-time use)
```

## What Cannot Be Manipulated

### ❌ Correct Answers

- Not present in client-side code
- Not visible in Network tab
- Not accessible via DevTools
- Only revealed after submission

### ❌ Timer

- Start time stored server-side
- Submit time validated against server time
- Pausing/modifying client timer won't help
- Max time enforced with grace period

### ❌ Score

- Calculated entirely server-side
- Client-side modifications ignored
- Score based on server's comparison of answers

### ❌ Session Hijacking

- Hash prevents tampering with session parameters
- Cannot reuse session after submission
- Cannot extend time limit
- Cannot change quiz ID

## Environment Variables

Add to `.env` file:

```bash
QUIZ_SECRET_KEY=your-super-secret-key-change-this-in-production-use-long-random-string
```

⚠️ **Important**: Change the secret key in production! Use a long, random string.

## API Endpoints

### POST `/api/generate-quiz`

**Request:**

```json
{
  "topic": "Quantum Physics",
  "difficulty": "intermediate",
  "questionCount": 15,
  "courseContext": "...",
  "timeLimit": 600,
  "userId": "user123"
}
```

**Response:**

```json
{
  "success": true,
  "sessionId": "a1b2c3...",
  "sessionHash": "d4e5f6...",
  "startTime": 1699401234567,
  "timeLimit": 600,
  "questions": [
    {
      "question": "What is the Heisenberg Uncertainty Principle?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "difficulty": "intermediate"
      // Note: NO correctAnswer field!
    }
  ]
}
```

### POST `/api/submit-quiz`

**Request:**

```json
{
  "sessionId": "a1b2c3...",
  "sessionHash": "d4e5f6...",
  "userAnswers": [1, 0, 2, 3, null],
  "submitTime": 1699401834567
}
```

**Response:**

```json
{
  "success": true,
  "results": {
    "totalQuestions": 5,
    "correctAnswers": 3,
    "wrongAnswers": 2,
    "score": 60,
    "timeTaken": 600,
    "timeLimit": 600,
    "detailedMistakes": [
      {
        "questionIndex": 1,
        "question": "...",
        "userAnswer": "Option A",
        "correctAnswer": "Option B",
        "explanation": "...",
        "options": ["A", "B", "C", "D"]
      }
    ]
  }
}
```

## Production Considerations

### 1. Session Storage

Current implementation uses in-memory Map. For production:

- Use Redis for distributed sessions
- Enables horizontal scaling
- Better session management

### 2. Rate Limiting

Add rate limiting to prevent:

- Quiz generation spam
- Submission flooding
- Brute force attacks

### 3. User Authentication

- Tie sessions to authenticated user IDs
- Prevent anonymous quiz abuse
- Track user quiz history

### 4. Monitoring

- Log suspicious activity:
  - Multiple failed submissions
  - Time limit violations
  - Invalid session attempts
- Alert on potential cheating patterns

## Testing Security

### Try to Cheat (All should fail):

1. **Inspect Network Tab for Answers**

   - ✅ Answers not present in response

2. **Modify Client-Side Timer**

   ```javascript
   // In DevTools console:
   timeLeft = 999999;
   // Result: Submission will fail server-side validation
   ```

3. **Tamper with Session Hash**

   ```javascript
   sessionHash = "fake-hash";
   // Result: Server rejects submission
   ```

4. **Submit After Time Limit**

   ```javascript
   // Wait 20 minutes on 10-minute quiz
   // Result: Server rejects (actualTime > timeLimit + 5s)
   ```

5. **Reuse Session**
   ```javascript
   // Submit quiz twice with same sessionId
   // Result: Second submission fails (session deleted)
   ```

## Migration from Old System

### Client Changes Required:

1. Update QuizInterface to use `sessionId`, `sessionHash`, `startTime`
2. Change submission to call `/api/submit-quiz` instead of client-side scoring
3. Handle server-validated results

### Backend Changes Required:

1. Import `quizSecurity.js` functions
2. Update `/api/generate-quiz` to create sessions
3. Add `/api/submit-quiz` endpoint
4. Store SECRET_KEY in environment

## Performance Impact

- ✅ Minimal: 3 API calls total (same as before)
- ✅ Session storage is fast (in-memory or Redis)
- ✅ Hash generation is instant (SHA-256)
- ✅ No additional database queries

## Summary

This implementation provides **strong protection** against common cheating methods while maintaining **good user experience**. The security is enforced server-side, making it extremely difficult to manipulate quiz results through client-side tools.
