import { GoogleGenerativeAI } from "@google/generative-ai";
import "dotenv/config";
import { retryWithBackoff } from "./retryUtils.mjs";
import { getModelForService, getQuizStageConfig } from "./modelConfig.mjs";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Multi-stage generation flag - set to true for more reliable results
 */
const USE_MULTI_STAGE_GENERATION = true;

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
  const stageConfig = getQuizStageConfig("questions");
  const model = genAI.getGenerativeModel({
    model: stageConfig.model,
    generationConfig: {
      temperature: stageConfig.temperature,
      // maxOutputTokens: 2048,
    },
  });

  console.log(
    `🎯 Stage 1 (Questions): Using ${stageConfig.model} (temp: ${stageConfig.temperature})`
  );

  const difficultyGuidelines = {
    beginner: "Basic concepts and definitions. Test fundamental recall.",
    intermediate:
      "Application of concepts. Require analysis and comprehension.",
    advanced: "Synthesis and evaluation. Critical thinking required.",
    expert: "Complex scenarios. Deep technical understanding required.",
  };

  const prompt = `Generate ONLY ${questionCount} UNIQUE and CONCISE quiz questions for the topic: "${topic}".

Difficulty Level: ${difficulty}
Guidelines: ${
    difficultyGuidelines[difficulty] || difficultyGuidelines.intermediate
  }

${courseContext ? `Course Context:\n${courseContext}\n` : ""}

CRITICAL REQUIREMENTS:
1. Keep questions SHORT and DIRECT (maximum 15-20 words)
2. Each question should be clear and test ${difficulty}-level understanding
3. Questions MUST be diverse and cover DIFFERENT aspects of the topic
4. **ABSOLUTELY NO DUPLICATE QUESTIONS** - each question must be unique
5. **ABSOLUTELY NO REPEATED CONCEPTS** 
6. Focus ONLY on creating high-quality questions

Return ONLY a valid JSON array of UNIQUE question strings:
["Question 1 text here?", "Question 2 text here?", ...]

Generate EXACTLY ${questionCount} UNIQUE, NON-REPETITIVE questions.`;

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

  if (!Array.isArray(questions)) {
    throw new Error("Response is not an array");
  }

  if (questions.length !== questionCount) {
    console.warn(
      `⚠️ Expected ${questionCount} questions, got ${questions.length}`
    );

    // If we got fewer questions, throw error to trigger retry
    if (questions.length < questionCount) {
      throw new Error(
        `Expected ${questionCount} questions, got ${questions.length}`
      );
    }

    // If we got more questions, trim to correct count
    console.warn(`   Trimming to ${questionCount} questions`);
  }

  const trimmedQuestions = questions
    .slice(0, questionCount)
    .map((q) => String(q).trim());

  // Duplicate detection - check for repeated questions
  const uniqueQuestions = new Set(
    trimmedQuestions.map((q) => normalizeText(q))
  );
  if (uniqueQuestions.size !== trimmedQuestions.length) {
    const duplicateCount = trimmedQuestions.length - uniqueQuestions.size;
    console.warn(
      `⚠️ Detected ${duplicateCount} duplicate question(s) - AI failed diversity requirement`
    );

    // Log duplicates for debugging
    const seen = new Set();
    trimmedQuestions.forEach((q, idx) => {
      const normalized = normalizeText(q);
      if (seen.has(normalized)) {
        console.warn(`   ❌ Duplicate found: Q${idx + 1}: "${q}"`);
      }
      seen.add(normalized);
    });

    throw new Error(
      `AI generated ${duplicateCount} duplicate question(s). Retrying for unique questions...`
    );
  }

  console.log(`✅ All ${trimmedQuestions.length} questions are unique`);
  console.log(trimmedQuestions);
  return trimmedQuestions;
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
  const stageConfig = getQuizStageConfig("options");
  const model = genAI.getGenerativeModel({
    model: stageConfig.model,
    generationConfig: {
      temperature: stageConfig.temperature,
      // maxOutputTokens: 4096, // Increased for batch processing
    },
  });

  console.log(
    `🎯 Stage 2 (Options): Using ${stageConfig.model} (temp: ${stageConfig.temperature})`
  );

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
4. Keep options SHORT and CONCISE (5-10 words each, max 15 words)
5. Ensure all options are roughly similar in length
6. THINK CAREFULLY about which option is correct before deciding
7. Double-check any numerical values, formulas, or technical details

VERIFICATION STEP - Before finalizing:
- Verify any numerical values against known constants
- Ensure technical terminology is used correctly
- Confirm the correct answer is unambiguous
- Check that each option is concise and to the point

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

  if (!Array.isArray(dataArray)) {
    throw new Error("Response is not an array");
  }

  if (dataArray.length !== questions.length) {
    console.warn(
      `⚠️ Expected ${questions.length} option sets, got ${dataArray.length}`
    );

    // If we got fewer options, throw error to trigger retry
    if (dataArray.length < questions.length) {
      throw new Error(
        `Expected ${questions.length} option sets, got ${dataArray.length}`
      );
    }

    // If we got more options, trim to correct count
    console.warn(`   Trimming to ${questions.length} option sets`);
    console.log(dataArray);
  }

  // Only process up to the number of questions we have
  const optionsToProcess = dataArray.slice(0, questions.length);

  return optionsToProcess.map((data, index) => {
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
  const stageConfig = getQuizStageConfig("explanations");
  const model = genAI.getGenerativeModel({
    model: stageConfig.model,
    generationConfig: {
      temperature: stageConfig.temperature,
      // maxOutputTokens: 4096, // Increased for batch processing
    },
  });

  console.log(
    `🎯 Stage 3 (Explanations): Using ${stageConfig.model} (temp: ${stageConfig.temperature})`
  );

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
1. Keep explanations VERY SHORT (1-2 sentences maximum, 20-30 words)
2. Explain WHY the correct answer is correct (briefly)
3. NO need to explain why other options are wrong (unless critical)
4. Get straight to the point - no fluff or unnecessary details
5. Include key concept/formula ONLY if essential

FACTUAL ACCURACY REQUIREMENT:
- Each explanation must be strictly correct based on standard undergraduate-level science.
- Do NOT use uncertain phrases or add contradictory claims.
- Be concise and direct.

EXAMPLE GOOD EXPLANATIONS:
✅ "Mitochondria produce ATP through cellular respiration."
✅ "Merge sort uses divide-and-conquer with O(n log n) complexity."
✅ "Entropy always increases in isolated systems per the second law."

EXAMPLE TOO LONG (AVOID):
❌ "The mitochondria is often called the powerhouse of the cell because it is responsible for producing adenosine triphosphate (ATP) through a process known as cellular respiration, which involves multiple stages including..."

Return ONLY a valid JSON array of explanation strings in the SAME ORDER as the questions:
["Brief explanation 1", "Brief explanation 2", ...]

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
    console.warn(
      `⚠️ Expected ${questionsWithOptions.length} explanations, got ${
        explanations?.length || 0
      }`
    );

    // If we got fewer explanations, throw error to trigger retry
    if (
      !Array.isArray(explanations) ||
      explanations.length < questionsWithOptions.length
    ) {
      throw new Error(
        `Expected ${questionsWithOptions.length} explanations, got ${
          explanations?.length || 0
        }`
      );
    }

    // If we got more explanations, just trim to the correct count
    console.warn(`   Trimming to ${questionsWithOptions.length} explanations`);
    return explanations
      .slice(0, questionsWithOptions.length)
      .map((exp) => String(exp).trim());
  }

  return explanations.map((exp) => String(exp).trim());
}

/**
 * Fallback: Generate a single explanation with structured output
 * Used when batch generation fails
 */
async function generateSingleExplanation(questionWithOptions, topic) {
  const stageConfig = getQuizStageConfig("explanations");

  const explanationSchema = {
    type: "object",
    properties: {
      explanation: {
        type: "string",
        description:
          "Clear explanation of why the correct answer is right and why others are wrong",
      },
    },
    required: ["explanation"],
  };

  const model = genAI.getGenerativeModel({
    model: stageConfig.model,
    generationConfig: {
      temperature: stageConfig.temperature,
      responseMimeType: "application/json",
      responseSchema: explanationSchema,
    },
  });

  const prompt = `Provide a clear, educational explanation for this quiz question.

Topic: "${topic}"

Question: "${questionWithOptions.question}"
Options: ${JSON.stringify(questionWithOptions.options)}
Correct Answer: "${questionWithOptions.correctAnswerText}"

VERIFICATION STEPS:
1. Verify the correct answer follows established principles
2. Double-check any numerical values or formulas
3. Ensure reasoning is logically sound

Requirements:
1. Keep explanation VERY SHORT (1-2 sentences, 20-30 words maximum)
2. Explain WHY the correct answer is correct
3. Be direct and to the point - no unnecessary details
4. Must be factually accurate based on standard undergraduate-level science
5. Include key concept/formula ONLY if essential

EXAMPLE: "Mitochondria produce ATP through cellular respiration." (7 words - perfect!)`;

  const result = await retryWithBackoff(
    async () => await model.generateContent(prompt),
    "Single Explanation"
  );

  const text = result.response.text();
  const data = JSON.parse(text);

  if (!data.explanation) {
    throw new Error("Structured output did not return explanation");
  }

  return String(data.explanation).trim();
}

/**
 * Stage 4: AI-Powered Fact-Checking and Correction (Mini-Batch Processing)
 * Processes questions in batches of 5 for better focus and accuracy
 * Uses centralized config for model and temperature
 */
async function factCheckAndCorrectQuestions(
  questionsWithAnswers,
  topic,
  difficulty
) {
  const stageConfig = getQuizStageConfig("fact-check");
  const BATCH_SIZE = 5; // Process 5 questions at a time

  console.log(
    `\n🔍 Stage 4 (Fact-Checking): AI validation of ${questionsWithAnswers.length} questions...`
  );
  console.log(
    `   Using ${stageConfig.model} (temp: ${stageConfig.temperature})`
  );
  console.log(`   Processing in mini-batches of ${BATCH_SIZE} questions`);

  const model = genAI.getGenerativeModel({
    model: stageConfig.model,
    generationConfig: {
      temperature: stageConfig.temperature,
    },
  });

  // Split questions into mini-batches
  const batches = [];
  for (let i = 0; i < questionsWithAnswers.length; i += BATCH_SIZE) {
    batches.push(questionsWithAnswers.slice(i, i + BATCH_SIZE));
  }

  console.log(`   Split into ${batches.length} batches`);

  // Process each batch
  const allCorrectedQuestions = [];
  let totalCorrections = 0;

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const batchNum = batchIndex + 1;

    console.log(
      `   📦 Processing batch ${batchNum}/${batches.length} (${batch.length} questions)...`
    );

    const questionsJSON = JSON.stringify(batch, null, 2);

    const prompt = `You are a STRICT FACT-CHECKING AI specializing in science education.
Your role is to VALIDATE and CORRECT quiz questions with zero tolerance for factual, logical, or formatting errors.

====================================
INPUT DETAILS
====================================
Topic: "${topic}"
Difficulty: ${difficulty}

QUESTIONS TO REVIEW (JSON):
${questionsJSON}

Each item contains:
{
  "question": "...",
  "options": ["A", "B", "C", "D"],
  "correctAnswerText": "...",
  "explanation": "..."
}

====================================
YOUR MANDATE
====================================
You must carefully review every question and:
1. ✅ **Verify factual accuracy** of the correct answer and explanation.
2. ✅ **Correct** any inaccurate or misleading statements.
3. ✅ **Ensure consistency**:
   - correctAnswerText MUST match exactly one of the options (character-for-character).
   - Explanation MUST support the marked correct answer.
4. ✅ **Replace hallucinations** with verified textbook facts.
5. ✅ **Check numerics/formulas** (e.g., constants, wavelengths, energy levels) against standard values.
6. ✅ **Standardize wording** (e.g., use “electron diffraction” or “Davisson–Germer experiment,” not both).

====================================
ZERO-TOLERANCE FIX RULES
====================================
❌ If correctAnswerText not found among options → FIX IT.
❌ If explanation contradicts the answer → FIX one to match the other.
❌ If correct answer is scientifically wrong → CHANGE it to the correct option and adjust explanation.
❌ If facts uncertain → OMIT speculation, keep only verified concepts.

====================================
REQUIRED OUTPUT FORMAT
====================================
Return a valid JSON array where each object has this EXACT structure:
[
  {
    "question": "Final corrected question (≤20 words)",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswerText": "EXACT text of correct option",
    "explanation": "Final verified explanation (≤25 words)",
    "corrected": true/false,
    "corrections": "Summary of changes or 'No corrections needed'"
  }
]

OUTPUT ONLY JSON, NOTHING ELSE.
Ensure JSON is valid and every correction follows scientific consensus.
`;

    const result = await retryWithBackoff(
      async () => await model.generateContent(prompt),
      `Stage 4: Fact-Checking (Batch ${batchNum}/${batches.length})`
    );

    let text = result.response
      .text()
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    const correctedBatch = JSON.parse(text);

    if (
      !Array.isArray(correctedBatch) ||
      correctedBatch.length !== batch.length
    ) {
      console.warn(
        `   ⚠️ Batch ${batchNum} fact-checker returned ${
          correctedBatch?.length || 0
        } questions, expected ${batch.length}`
      );
      console.warn(`   Using original batch without fact-checking`);
      allCorrectedQuestions.push(...batch);
      continue;
    }

    // Log corrections made in this batch
    let batchCorrectionCount = 0;
    correctedBatch.forEach((q, idx) => {
      if (q.corrected && q.corrections !== "No corrections needed") {
        batchCorrectionCount++;
        const globalIdx = batchIndex * BATCH_SIZE + idx + 1;
        console.log(`      ⚠️ Q${globalIdx} corrected: ${q.corrections}`);
      }
    });

    if (batchCorrectionCount > 0) {
      console.log(
        `   ✅ Batch ${batchNum} made ${batchCorrectionCount} corrections`
      );
      totalCorrections += batchCorrectionCount;
    } else {
      console.log(`   ✅ Batch ${batchNum} verified - no corrections needed`);
    }

    // Add corrected batch to results
    const cleanedBatch = correctedBatch.map((q) => ({
      question: q.question,
      options: q.options,
      correctAnswerText: q.correctAnswerText,
      explanation: q.explanation,
    }));

    allCorrectedQuestions.push(...cleanedBatch);
  } // End of batch loop

  console.log(
    `✅ All batches complete: ${allCorrectedQuestions.length} questions validated`
  );
  if (totalCorrections > 0) {
    console.log(`   Total corrections made: ${totalCorrections}`);
  } else {
    console.log(`   No corrections needed - all questions verified`);
  }

  // Final duplicate check after fact-checking
  const uniqueAfterFactCheck = new Set(
    allCorrectedQuestions.map((q) => normalizeText(q.question))
  );
  if (uniqueAfterFactCheck.size !== allCorrectedQuestions.length) {
    const duplicateCount =
      allCorrectedQuestions.length - uniqueAfterFactCheck.size;
    console.warn(
      `⚠️ Warning: ${duplicateCount} duplicate(s) found after fact-checking`
    );

    // Remove duplicates, keeping first occurrence
    const seen = new Set();
    const dedupedQuestions = allCorrectedQuestions.filter((q) => {
      const normalized = normalizeText(q.question);
      if (seen.has(normalized)) {
        console.warn(`   🗑️ Removing duplicate: "${q.question}"`);
        return false;
      }
      seen.add(normalized);
      return true;
    });

    console.log(
      `   ✅ Removed duplicates: ${dedupedQuestions.length} unique questions remaining`
    );
    return dedupedQuestions;
  }

  console.log(`✅ No duplicates detected - all questions are unique`);
  return allCorrectedQuestions;
}

/**
 * Stage 5: Verify and reconcile (after fact-checking)
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
 *
 * Pipeline:
 * Stage 1: Generate Questions (gemini-2.5-flash-lite, temp 0.2)
 * Stage 2: Generate Options (gemini-2.5-flash, temp 0.1)
 * Stage 3: Generate Explanations (gemini-2.5-flash, temp 0.1)
 * Stage 4: AI Fact-Check & Correct (gemini-2.5-flash-lite, temp 0.05) ⭐ NEW
 * Stage 5: Final Validation (code-based)
 *
 * All stages tracked in analytics with token counting and cost calculation
 */
async function generateWithMultiStage(
  topic,
  difficulty,
  questionCount,
  courseContext
) {
  console.log(
    `\n🚀 Starting multi-stage quiz generation for ${questionCount} questions...\n`
  );

  // Stage 1: Generate questions (1 API call) - with retry
  let questions;
  let questionsRetryCount = 0;
  const maxRetries = 2;

  while (questionsRetryCount <= maxRetries) {
    try {
      questions = await generateQuestionsOnly(
        topic,
        difficulty,
        questionCount,
        courseContext
      );
      break; // Success, exit retry loop
    } catch (error) {
      questionsRetryCount++;
      if (questionsRetryCount > maxRetries) {
        console.error("❌ Failed to generate questions after all retries");
        throw error;
      }
      console.warn(
        `⚠️ Stage 1 failed, retrying (${questionsRetryCount}/${maxRetries})...`
      );
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2s before retry
    }
  }

  // Stage 2: Generate options for ALL questions (1 API call instead of N) - with retry
  let allOptionsData;
  let optionsRetryCount = 0;

  while (optionsRetryCount <= maxRetries) {
    try {
      allOptionsData = await generateOptionsForAllQuestions(
        questions,
        topic,
        difficulty,
        courseContext
      );
      break; // Success, exit retry loop
    } catch (error) {
      optionsRetryCount++;
      if (optionsRetryCount > maxRetries) {
        console.error("❌ Failed to generate options after all retries");
        throw error;
      }
      console.warn(
        `⚠️ Stage 2 failed, retrying (${optionsRetryCount}/${maxRetries})...`
      );
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2s before retry
    }
  }

  // Combine questions with their options
  const questionsWithOptions = questions.map((question, i) => ({
    question,
    options: allOptionsData[i].options,
    correctAnswerText: allOptionsData[i].correctAnswerText,
  }));

  // Stage 3: Generate explanations for ALL questions (1 API call instead of N)
  let allExplanations;
  try {
    allExplanations = await generateExplanationsForAllQuestions(
      questionsWithOptions,
      topic
    );
  } catch (error) {
    console.error("❌ Failed to generate all explanations:", error.message);
    console.log("🔄 Generating fallback explanations...");

    // Fallback: Generate explanations one by one for any missing
    allExplanations = [];
    for (let i = 0; i < questionsWithOptions.length; i++) {
      try {
        const singleExplanation = await generateSingleExplanation(
          questionsWithOptions[i],
          topic
        );
        allExplanations.push(singleExplanation);
      } catch (singleError) {
        console.error(
          `⚠️ Failed to generate explanation for question ${
            i + 1
          }, using default`
        );
        allExplanations.push(
          `The correct answer is "${questionsWithOptions[i].correctAnswerText}".`
        );
      }
    }
  }

  // Combine everything
  const questionsWithAnswers = questionsWithOptions.map((q, i) => ({
    ...q,
    explanation:
      allExplanations[i] || `The correct answer is "${q.correctAnswerText}".`,
  }));

  // Stage 4: AI Fact-Checking and Correction
  let factCheckedQuestions;
  try {
    factCheckedQuestions = await factCheckAndCorrectQuestions(
      questionsWithAnswers,
      topic,
      difficulty
    );
  } catch (error) {
    console.warn(
      "⚠️ Fact-checking failed, using original questions:",
      error.message
    );
    factCheckedQuestions = questionsWithAnswers;
  }

  // Stage 5: Verify and reconcile
  const verifiedQuestions = factCheckedQuestions.map((q, i) =>
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
    const modelName = getModelForService("generate-quiz");
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: 0.2, // REDUCED: More factual and consistent
        // maxOutputTokens: 4096,
      },
    });

    console.log(
      `🎯 Single-Stage Quiz Generation: Using ${modelName} (temp: 0.2)`
    );

    const difficultyGuidelines = {
      beginner: "Basic concepts and definitions. Test fundamental recall.",
      intermediate:
        "Application of concepts. Require analysis and comprehension.",
      advanced: "Synthesis and evaluation. Critical thinking required.",
      expert: "Complex scenarios. Deep technical understanding required.",
    };

    const prompt = `Generate ${questionCount} multiple-choice quiz questions for the topic: "${topic}".

Difficulty Level: ${difficulty}
Guidelines: ${
      difficultyGuidelines[difficulty] || difficultyGuidelines.intermediate
    }

${courseContext ? `Course Context:\n${courseContext}\n` : ""}

Requirements:
1. Keep questions SHORT (maximum 15-20 words)
2. Provide exactly 4 options - each option SHORT (5-10 words)
3. Only ONE option should be correct
4. Difficulty should strictly match the ${difficulty} level
5. Questions should be diverse and cover different aspects of the topic
6. Include a VERY SHORT explanation (1-2 sentences, 20-30 words max)
7. Avoid trick questions or ambiguous wording
8. Make incorrect options plausible but clearly wrong
9. NO long scenarios - get straight to the point

Return ONLY a valid JSON array with this EXACT structure (no additional text):
[
  {
    "question": "SHORT question (15-20 words max)",
    "options": ["Short option A", "Short option B", "Short option C", "Short option D"],
    "correctAnswer": 0,
    "correctAnswerText": "Short option A",
    "explanation": "Very short explanation (1-2 sentences, 20-30 words max)"
  }
]

EXAMPLE:
{
  "question": "What is the primary function of mitochondria?",
  "options": ["Protein synthesis", "ATP production", "DNA replication", "Lipid storage"],
  "correctAnswer": 1,
  "correctAnswerText": "ATP production",
  "explanation": "Mitochondria produce ATP through cellular respiration."
}

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

    // Fact-check the generated questions
    console.log("\n🔍 Running AI fact-checker...");
    const questionsForFactCheck = validatedQuestions.map((q) => ({
      question: q.question,
      options: q.options,
      correctAnswerText: q.options[q.correctAnswer],
      explanation: q.explanation,
    }));

    let factCheckedData;
    try {
      factCheckedData = await factCheckAndCorrectQuestions(
        questionsForFactCheck,
        topic,
        difficulty
      );
    } catch (error) {
      console.warn(
        "⚠️ Fact-checking failed, using original questions:",
        error.message
      );
      factCheckedData = questionsForFactCheck;
    }

    // Merge fact-checked data back
    const finalQuestions = validatedQuestions.map((q, idx) => {
      const factChecked = factCheckedData[idx];

      // Find correct answer index from fact-checked data
      const correctIndex = factChecked.options.findIndex(
        (opt) =>
          normalizeText(opt) === normalizeText(factChecked.correctAnswerText)
      );

      return {
        question: factChecked.question,
        options: factChecked.options,
        correctAnswer: correctIndex !== -1 ? correctIndex : q.correctAnswer,
        explanation: factChecked.explanation,
        difficulty: difficulty,
      };
    });

    // Log all questions for debugging
    console.log("\n" + "=".repeat(80));
    console.log("GENERATED QUIZ QUESTIONS (FACT-CHECKED)");
    console.log("=".repeat(80));
    finalQuestions.forEach((q, idx) => {
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

    return finalQuestions;
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
    const modelName = getModelForService("practice-questions");
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: 0.8,
        // maxOutputTokens: 2048,
      },
    });

    console.log(`🎯 Practice Questions: Using ${modelName}`);

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
