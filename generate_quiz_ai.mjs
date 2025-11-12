import { GoogleGenerativeAI } from "@google/generative-ai";
import "dotenv/config";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Multi-stage generation flag - set to true for more reliable results
 */
const USE_MULTI_STAGE_GENERATION = true;

/**
 * Rate limiting configuration
 */
const RATE_LIMIT_CONFIG = {
  maxRetries: 3,
  baseDelay: 2000, // 2 seconds
  maxDelay: 30000, // 30 seconds
};

/**
 * Sleep utility for rate limiting
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry wrapper with exponential backoff for API calls
 * Handles 503 (Service Unavailable), 429 (Too Many Requests), and other transient errors
 */
async function retryWithBackoff(apiCall, callName = "API call") {
  let lastError;

  for (let attempt = 0; attempt < RATE_LIMIT_CONFIG.maxRetries; attempt++) {
    try {
      return await apiCall();
    } catch (error) {
      lastError = error;

      // Check if it's a retryable error (rate limit, service unavailable, etc.)
      const isRetryableError =
        error.status === 429 || // Too Many Requests
        error.status === 503 || // Service Unavailable
        error.status === 500 || // Internal Server Error (sometimes transient)
        error.message?.includes("429") ||
        error.message?.includes("503") ||
        error.message?.includes("quota") ||
        error.message?.includes("rate limit") ||
        error.message?.includes("service unavailable");

      if (isRetryableError && attempt < RATE_LIMIT_CONFIG.maxRetries - 1) {
        // Exponential backoff: 2s, 4s, 8s, etc.
        const delay = Math.min(
          RATE_LIMIT_CONFIG.baseDelay * Math.pow(2, attempt),
          RATE_LIMIT_CONFIG.maxDelay
        );

        console.warn(
          `⚠️  ${
            error.status === 503 ? "Service unavailable" : "Rate limit"
          } for ${callName}. Retrying in ${delay / 1000}s... (Attempt ${
            attempt + 1
          }/${RATE_LIMIT_CONFIG.maxRetries})`
        );
        await sleep(delay);
        continue;
      }

      // If it's not a retryable error or we've exhausted retries, throw
      throw error;
    }
  }

  throw lastError;
}

/**
 * Normalize text for comparison
 */
function normalizeText(text) {
  return String(text).toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Stage 1: Generate only the questions
 */
async function generateQuestionsOnly(
  topic,
  difficulty,
  questionCount,
  courseContext
) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      temperature: 0.7,
      // maxOutputTokens: 2048,
    },
  });

  const difficultyGuidelines = {
    beginner:
      "Focus on basic concepts, definitions, and fundamental understanding.",
    intermediate:
      "Include application of concepts, comparison between ideas, and understanding of relationships.",
    advanced:
      "Focus on synthesis, evaluation, and problem-solving requiring critical thinking.",
    expert:
      "Include complex scenarios, edge cases, and deep technical understanding requiring expert-level reasoning.",
  };

  const prompt = `Generate ONLY ${questionCount} clear, unambiguous quiz questions for the topic: "${topic}".

Difficulty Level: ${difficulty}
Guidelines: ${
    difficultyGuidelines[difficulty] || difficultyGuidelines.intermediate
  }

${courseContext ? `Course Context:\n${courseContext}\n` : ""}

Requirements:
1. Each question should be clear and test ${difficulty}-level understanding
2. Questions should be diverse and cover different aspects of the topic
3. Avoid trick questions or ambiguous wording
4. Focus ONLY on creating high-quality questions - DO NOT include answers yet

Return ONLY a valid JSON array of question strings:
["Question 1 text here?", "Question 2 text here?", ...]

Generate EXACTLY ${questionCount} questions.`;

  const result = await retryWithBackoff(
    async () => await model.generateContent(prompt),
    "Stage 1: Questions"
  );

  let text = result.response
    .text()
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  const questions = JSON.parse(text);
  if (!Array.isArray(questions) || questions.length !== questionCount) {
    throw new Error(
      `Expected ${questionCount} questions, got ${questions.length}`
    );
  }

  return questions.map((q) => String(q).trim());
}

/**
 * Stage 2: Generate options for ALL questions in ONE API call (BATCHED)
 * This reduces API calls from N to 1, solving rate limit issues
 */
async function generateOptionsForAllQuestions(
  questions,
  topic,
  difficulty,
  courseContext
) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      temperature: 0.3,
      // maxOutputTokens: 4096, // Increased for batch processing
    },
  });

  const questionsNumbered = questions
    .map((q, i) => `${i + 1}. ${q}`)
    .join("\n");

  const prompt = `For these ${
    questions.length
  } quiz questions, generate exactly 4 multiple-choice options for EACH:

Topic: "${topic}"
Difficulty: ${difficulty}
${courseContext ? `Context: ${courseContext}\n` : ""}

Questions:
${questionsNumbered}

Requirements for EACH question:
1. Generate EXACTLY 4 distinct options
2. Only ONE option should be correct
3. Make incorrect options plausible but clearly wrong
4. Ensure all options are roughly similar in length and complexity
5. THINK CAREFULLY about which option is correct before deciding
6. Double-check any numerical values, formulas, or technical details

VERIFICATION STEP - Before finalizing:
- Verify any numerical values against known constants
- Ensure technical terminology is used correctly
- Confirm the correct answer is unambiguous

Return ONLY a valid JSON array with this EXACT structure (one object per question):
[
  {
    "questionNumber": 1,
    "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
    "correctAnswerText": "The EXACT text of the correct option from above"
  },
  {
    "questionNumber": 2,
    "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
    "correctAnswerText": "The EXACT text of the correct option from above"
  }
]
FACTUAL CHECKLIST:
 - Ensure every statement is based on established facts, formulas, or principles.
 - Do NOT invent information or extend beyond standard textbook knowledge.
 - Avoid vague phrases like “accurately predicts for all atoms” unless it is universally true.
 - Double-check scientific accuracy using reasoning, not speculation.

CRITICAL: 
- Generate options for ALL ${questions.length} questions
- The correctAnswerText MUST be EXACTLY one of the 4 options (character-for-character match)
- Return in the same order as the questions above`;

  const result = await retryWithBackoff(
    async () => await model.generateContent(prompt),
    "Stage 2: Options"
  );

  let text = result.response
    .text()
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  const dataArray = JSON.parse(text);

  if (!Array.isArray(dataArray) || dataArray.length !== questions.length) {
    throw new Error(
      `Expected ${questions.length} option sets, got ${dataArray.length}`
    );
  }

  return dataArray.map((data, index) => {
    if (!Array.isArray(data.options) || data.options.length !== 4) {
      throw new Error(`Question ${index + 1}: Must have exactly 4 options`);
    }

    if (!data.correctAnswerText) {
      throw new Error(`Question ${index + 1}: Missing correctAnswerText`);
    }

    return {
      options: data.options.map((opt) => String(opt).trim()),
      correctAnswerText: String(data.correctAnswerText).trim(),
    };
  });
}

/**
 * Stage 3: Generate explanations for ALL questions in ONE API call (BATCHED)
 * This reduces API calls from N to 1, solving rate limit issues
 */
async function generateExplanationsForAllQuestions(
  questionsWithOptions,
  topic
) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      temperature: 0.3,
      // maxOutputTokens: 4096, // Increased for batch processing
    },
  });

  const questionsFormatted = questionsWithOptions
    .map((q, i) => {
      return `Question ${i + 1}: "${q.question}"
Options: ${JSON.stringify(q.options)}
Correct Answer: "${q.correctAnswerText}"`;
    })
    .join("\n\n");

  const prompt = `Provide clear, educational explanations for these ${questionsWithOptions.length} quiz questions.

Topic: "${topic}"

${questionsFormatted}

CRITICAL FACTUAL AND LOGICAL VERIFICATION STEPS FOR EACH:
1. Verify that the correct answer follows from established scientific principles only.
2. If uncertainty exists, prefer textbook consensus explanations over speculation.
3. Do NOT exaggerate something beyond known limitations.
4. Double-check numerical values, constants, and relationships for scientific correctness.
5. Verify that every statement aligns with known physics/chemistry concepts.


After generating each explanation, THINK TWICE:
- Are the numbers correct?
- Is the reasoning logically sound?
- Would this explanation withstand peer review?

Requirements for EACH explanation:
1. Explain WHY the correct answer is correct
2. Briefly explain why the other options are incorrect
3. Include relevant concepts or formulas if applicable
4. Keep it concise but informative (2-4 sentences)

FACTUAL ACCURACY REQUIREMENT:
- Each explanation must be strictly correct based on standard undergraduate-level science.
- Do NOT use uncertain phrases or add contradictory claims.

Return ONLY a valid JSON array of explanation strings in the SAME ORDER as the questions:
[...", "...", "..."]

Generate EXACTLY ${questionsWithOptions.length} explanations.`;

  const result = await retryWithBackoff(
    async () => await model.generateContent(prompt),
    "Stage 3: Explanations"
  );

  let text = result.response
    .text()
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  const explanations = JSON.parse(text);

  if (
    !Array.isArray(explanations) ||
    explanations.length !== questionsWithOptions.length
  ) {
    throw new Error(
      `Expected ${questionsWithOptions.length} explanations, got ${
        explanations?.length || 0
      }`
    );
  }

  return explanations.map((exp) => String(exp).trim());
}

/**
 * Stage 4: Verify and reconcile
 */
function verifyAndReconcileQuestion(questionData, index) {
  const { question, options, correctAnswerText, explanation } = questionData;

  console.log(`\n🔍 Verifying Question ${index + 1}...`);

  // Find the correct answer index
  const correctIndex = options.findIndex(
    (opt) => normalizeText(opt) === normalizeText(correctAnswerText)
  );

  if (correctIndex === -1) {
    console.error(`❌ Question ${index + 1}: Verification FAILED`);
    console.error(`   Correct Answer Text: "${correctAnswerText}"`);
    console.error(`   Options: ${JSON.stringify(options)}`);
    throw new Error(
      `Question ${index + 1}: correctAnswerText not found in options`
    );
  }

  // Check for duplicate options
  const uniqueOptions = new Set(options.map(normalizeText));
  if (uniqueOptions.size !== 4) {
    throw new Error(`Question ${index + 1}: Contains duplicate options`);
  }

  console.log(
    `   ✅ Correct answer: ${String.fromCharCode(65 + correctIndex)}`
  );
  console.log(`   ✅ All validations passed`);

  return {
    question,
    options,
    correctAnswer: correctIndex,
    explanation,
    verified: true,
  };
}

/**
 * Generate quiz questions using multi-stage approach
 */
async function generateWithMultiStage(
  topic,
  difficulty,
  questionCount,
  courseContext
) {
  // Stage 1: Generate questions (1 API call)
  const questions = await generateQuestionsOnly(
    topic,
    difficulty,
    questionCount,
    courseContext
  );

  // Stage 2: Generate options for ALL questions (1 API call instead of N)
  const allOptionsData = await generateOptionsForAllQuestions(
    questions,
    topic,
    difficulty,
    courseContext
  );

  // Combine questions with their options
  const questionsWithOptions = questions.map((question, i) => ({
    question,
    options: allOptionsData[i].options,
    correctAnswerText: allOptionsData[i].correctAnswerText,
  }));

  // Stage 3: Generate explanations for ALL questions (1 API call instead of N)
  const allExplanations = await generateExplanationsForAllQuestions(
    questionsWithOptions,
    topic
  );

  // Combine everything
  const questionsWithAnswers = questionsWithOptions.map((q, i) => ({
    ...q,
    explanation: allExplanations[i],
  }));

  // Stage 4: Verify and reconcile
  const verifiedQuestions = questionsWithAnswers.map((q, i) =>
    verifyAndReconcileQuestion(q, i)
  );

  // Log all questions for debugging
  console.log("\n" + "=".repeat(80));
  console.log("GENERATED QUIZ QUESTIONS");
  console.log("=".repeat(80));
  verifiedQuestions.forEach((q, idx) => {
    console.log(`\nQuestion ${idx + 1}: ${q.question}`);
    q.options.forEach((opt, optIdx) => {
      const marker = optIdx === q.correctAnswer ? "✅" : " ";
      console.log(`  [${marker}] ${String.fromCharCode(65 + optIdx)}. ${opt}`);
    });
    console.log(`  Answer: ${String.fromCharCode(65 + q.correctAnswer)}`);
    console.log(`  Explanation: ${q.explanation}`);
  });
  console.log("=".repeat(80) + "\n");

  return verifiedQuestions.map((q) => ({ ...q, difficulty }));
}

/**
 * Generate quiz questions using Gemini AI
 * @param {string} topic - The topic for quiz questions
 * @param {string} difficulty - Difficulty level (beginner, intermediate, advanced, expert)
 * @param {number} questionCount - Number of questions to generate
 * @param {string} courseContext - Additional course context
 * @returns {Promise<Array>} Array of quiz questions
 */
export async function GenerateQuizQuestions(
  topic,
  difficulty,
  questionCount,
  courseContext = ""
) {
  try {
    // Use multi-stage generation for better reliability
    if (USE_MULTI_STAGE_GENERATION) {
      return await generateWithMultiStage(
        topic,
        difficulty,
        questionCount,
        courseContext
      );
    }

    // Original single-stage generation (kept for backward compatibility)
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        temperature: 0.7,
        // maxOutputTokens: 4096,
      },
    });

    const difficultyGuidelines = {
      beginner:
        "Focus on basic concepts, definitions, and fundamental understanding. Questions should be straightforward and test recall of key information.",
      intermediate:
        "Include application of concepts, comparison between ideas, and understanding of relationships. Questions should require analysis and comprehension.",
      advanced:
        "Focus on synthesis, evaluation, and problem-solving. Questions should require critical thinking and ability to apply knowledge in new contexts.",
      expert:
        "Include complex scenarios, edge cases, and deep technical understanding. Questions should challenge mastery-level knowledge and require expert-level reasoning.",
    };

    const prompt = `Generate ${questionCount} multiple-choice quiz questions for the topic: "${topic}".

Difficulty Level: ${difficulty}
Guidelines: ${
      difficultyGuidelines[difficulty] || difficultyGuidelines.intermediate
    }

${courseContext ? `Course Context:\n${courseContext}\n` : ""}

Requirements:
1. Each question should be clear, concise, and unambiguous
2. Provide exactly 4 options labeled A, B, C, D
3. Only ONE option should be correct
4. Difficulty should strictly match the ${difficulty} level
5. Questions should be diverse and cover different aspects of the topic
6. Include a brief, educational explanation for the correct answer
7. Avoid trick questions or ambiguous wording
8. Make incorrect options plausible but clearly wrong

Return ONLY a valid JSON array with this EXACT structure (no additional text):
[
  {
    "question": "Question text here",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": 0,
    "correctAnswerText": "Option A",
    "explanation": "Brief explanation of why this is correct and why others are wrong"
  }
]

CRITICAL REQUIREMENTS FOR correctAnswer:
- correctAnswer MUST be the INDEX (0-3) of the correct option in the options array
- DOUBLE-CHECK: If "Option B" is correct, correctAnswer should be 1 (not 0 or 2)
- TRIPLE-CHECK: Count carefully - array indices start at 0
- Example: ["Wrong", "Correct", "Wrong", "Wrong"] → correctAnswer = 1
- ALSO provide correctAnswerText field with the EXACT text of the correct answer for verification
- Return ONLY the JSON array, absolutely no other text before or after
- Ensure the JSON is properly formatted and valid
- Generate EXACTLY ${questionCount} questions

VERIFICATION STEP:
Before returning, verify that options[correctAnswer] === correctAnswerText for each question.`;

    console.log("🤖 Sending request to Gemini AI for quiz generation...");

    const result = await model.generateContent(prompt);
    const response = result.response;
    let text = response.text();

    console.log("📝 Received response from Gemini AI");

    // Clean up the response - remove markdown code blocks if present
    text = text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    // Parse the JSON
    let questions;
    try {
      questions = JSON.parse(text);
    } catch (parseError) {
      console.error("❌ JSON Parse Error:", parseError);
      console.error("Raw response:", text);
      throw new Error("Failed to parse AI response as JSON");
    }

    // Validate the questions array
    if (!Array.isArray(questions)) {
      throw new Error("AI response is not an array");
    }

    if (questions.length === 0) {
      throw new Error("AI generated 0 questions");
    }

    // Validate and sanitize each question
    const validatedQuestions = questions.map((q, index) => {
      // Validate structure
      if (!q.question || typeof q.question !== "string") {
        throw new Error(
          `Question ${index + 1} missing or invalid question text`
        );
      }

      if (!Array.isArray(q.options) || q.options.length !== 4) {
        throw new Error(`Question ${index + 1} must have exactly 4 options`);
      }

      if (
        typeof q.correctAnswer !== "number" ||
        q.correctAnswer < 0 ||
        q.correctAnswer > 3
      ) {
        throw new Error(
          `Question ${index + 1} has invalid correctAnswer (must be 0-3)`
        );
      }

      // Ensure all options are strings
      const sanitizedOptions = q.options.map((opt) => String(opt).trim());

      // CRITICAL VALIDATION: Verify correctAnswer index matches correctAnswerText
      if (q.correctAnswerText) {
        const actualCorrectText = sanitizedOptions[q.correctAnswer];
        const providedCorrectText = String(q.correctAnswerText).trim();

        // Check if they match (case-insensitive, whitespace-normalized)
        const normalizeText = (text) =>
          text.toLowerCase().replace(/\s+/g, " ").trim();

        if (
          normalizeText(actualCorrectText) !==
          normalizeText(providedCorrectText)
        ) {
          console.warn(`⚠️ Question ${index + 1}: AI hallucination detected!`);
          console.warn(`   Question: ${q.question}`);
          console.warn(
            `   AI claimed correct answer is: "${providedCorrectText}"`
          );
          console.warn(
            `   But correctAnswer index ${q.correctAnswer} points to: "${actualCorrectText}"`
          );
          console.warn(`   Options: ${JSON.stringify(sanitizedOptions)}`);

          // Try to find the correct index
          const correctIndex = sanitizedOptions.findIndex(
            (opt) => normalizeText(opt) === normalizeText(providedCorrectText)
          );

          if (correctIndex !== -1) {
            console.warn(
              `   ✅ Fixed: Correcting index from ${q.correctAnswer} to ${correctIndex}`
            );
            q.correctAnswer = correctIndex;
          } else {
            console.error(
              `   ❌ Cannot auto-fix: correctAnswerText not found in options`
            );
            throw new Error(
              `Question ${
                index + 1
              }: AI hallucination - correctAnswerText "${providedCorrectText}" not found in options`
            );
          }
        }
      }

      return {
        question: String(q.question).trim(),
        options: sanitizedOptions,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation ? String(q.explanation).trim() : "",
        difficulty: difficulty,
      };
    });

    // Log all questions for debugging
    console.log("\n" + "=".repeat(80));
    console.log("GENERATED QUIZ QUESTIONS");
    console.log("=".repeat(80));
    validatedQuestions.forEach((q, idx) => {
      console.log(`\nQuestion ${idx + 1}: ${q.question}`);
      q.options.forEach((opt, optIdx) => {
        const marker = optIdx === q.correctAnswer ? "✅" : " ";
        console.log(
          `  [${marker}] ${String.fromCharCode(65 + optIdx)}. ${opt}`
        );
      });
      console.log(`  Answer: ${String.fromCharCode(65 + q.correctAnswer)}`);
      console.log(`  Explanation: ${q.explanation}`);
    });
    console.log("=".repeat(80) + "\n");

    return validatedQuestions;
  } catch (error) {
    console.error("❌ Error in GenerateQuizQuestions:", error);
    throw error;
  }
}

/**
 * Generate suggested practice questions (non-quiz format)
 * @param {string} topic - The topic for practice questions
 * @param {string} context - Course context
 * @returns {Promise<Array>} Array of practice questions
 */
export async function GeneratePracticeQuestions(topic, context = "") {
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        temperature: 0.8,
        // maxOutputTokens: 2048,
      },
    });

    const prompt = `Generate 5 thoughtful practice questions about: "${topic}"

${context ? `Context:\n${context}\n` : ""}

Requirements:
1. Questions should encourage critical thinking
2. Mix of question types: conceptual, application-based, and analytical
3. Questions should help reinforce learning
4. No need for multiple choice options - open-ended is fine

Return ONLY a JSON array of question strings:
["Question 1?", "Question 2?", ...]`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    let text = response.text();

    text = text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    const questions = JSON.parse(text);

    if (!Array.isArray(questions)) {
      throw new Error("Invalid response format");
    }

    return questions.map((q) => String(q).trim());
  } catch (error) {
    console.error("❌ Error in GeneratePracticeQuestions:", error);
    throw error;
  }
}
