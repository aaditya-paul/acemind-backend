import crypto from "crypto";

/**
 * Security utilities for quiz system
 * Prevents manipulation of answers and timing through DevTools
 */

const SECRET_KEY = process.env.QUIZ_SECRET_KEY;

/**
 * Generate a secure hash for quiz session
 * @param {string} quizId - Quiz identifier
 * @param {number} startTime - Quiz start timestamp
 * @param {number} timeLimit - Time limit in seconds
 * @returns {string} Secure hash
 */
export function generateQuizHash(quizId, startTime, timeLimit) {
  const data = `${quizId}-${startTime}-${timeLimit}-${SECRET_KEY}`;
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * Verify quiz session hash
 * @param {string} quizId - Quiz identifier
 * @param {number} startTime - Quiz start timestamp
 * @param {number} timeLimit - Time limit in seconds
 * @param {string} hash - Hash to verify
 * @returns {boolean} True if valid
 */
export function verifyQuizHash(quizId, startTime, timeLimit, hash) {
  const expectedHash = generateQuizHash(quizId, startTime, timeLimit);
  return expectedHash === hash;
}

/**
 * Create answer key hash (server-side only, never sent to client)
 * @param {Array} questions - Quiz questions with correct answers
 * @returns {Object} Map of question index to answer hash
 */
export function createAnswerKeyHash(questions) {
  const answerKey = {};
  questions.forEach((q, index) => {
    const answerData = `${index}-${q.correctAnswer}-${SECRET_KEY}`;
    answerKey[index] = crypto
      .createHash("sha256")
      .update(answerData)
      .digest("hex");
  });
  return answerKey;
}

/**
 * Strip sensitive data from questions before sending to client
 * @param {Array} questions - Quiz questions
 * @returns {Array} Safe questions without correct answers
 */
export function sanitizeQuestionsForClient(questions) {
  return questions.map((q) => ({
    question: q.question,
    options: q.options,
    difficulty: q.difficulty,
    // Remove correctAnswer and explanation - these should never reach the client
  }));
}

/**
 * Validate quiz submission server-side
 * @param {Object} params - Submission parameters
 * @returns {Object} Validation result
 */
export function validateQuizSubmission({
  quizId,
  startTime,
  submitTime,
  timeLimit,
  sessionHash,
  userAnswers,
  correctAnswers,
}) {
  const errors = [];

  // 1. Verify session hash
  if (!verifyQuizHash(quizId, startTime, timeLimit, sessionHash)) {
    errors.push("Invalid quiz session");
  }

  // 2. Verify timing (with 5 second grace period for network lag)
  const actualTimeTaken = Math.floor((submitTime - startTime) / 1000);
  const maxAllowedTime = timeLimit + 5; // 5 second grace period

  if (actualTimeTaken > maxAllowedTime) {
    errors.push("Time limit exceeded");
  }

  if (actualTimeTaken < 0) {
    errors.push("Invalid submission time");
  }

  // 3. Verify answer format
  if (!Array.isArray(userAnswers)) {
    errors.push("Invalid answer format");
  }

  if (userAnswers.length !== correctAnswers.length) {
    errors.push("Answer count mismatch");
  }

  // 4. Verify answer values are within valid range
  userAnswers.forEach((answer, index) => {
    if (answer !== null && (answer < 0 || answer > 3)) {
      errors.push(`Invalid answer value at question ${index + 1}`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    actualTimeTaken,
  };
}

/**
 * Calculate quiz score server-side
 * @param {Array} userAnswers - User's answers
 * @param {Array} correctAnswers - Correct answers
 * @returns {Object} Score details
 */
export function calculateScore(userAnswers, correctAnswers) {
  let correctCount = 0;
  const mistakes = [];

  correctAnswers.forEach((correctAnswer, index) => {
    const userAnswer = userAnswers[index];

    if (userAnswer === correctAnswer) {
      correctCount++;
    } else {
      mistakes.push({
        questionIndex: index,
        userAnswer: userAnswer,
        correctAnswer: correctAnswer,
      });
    }
  });

  const score = Math.round((correctCount / correctAnswers.length) * 100);

  return {
    totalQuestions: correctAnswers.length,
    correctAnswers: correctCount,
    wrongAnswers: correctAnswers.length - correctCount,
    score,
    mistakes,
  };
}

/**
 * Generate a unique session ID for a quiz attempt
 * @param {string} userId - User identifier
 * @param {string} quizId - Quiz identifier
 * @returns {string} Unique session ID
 */
export function generateSessionId(userId, quizId) {
  const timestamp = Date.now();
  const random = crypto.randomBytes(16).toString("hex");
  const data = `${userId}-${quizId}-${timestamp}-${random}`;
  return crypto.createHash("sha256").update(data).digest("hex");
}
