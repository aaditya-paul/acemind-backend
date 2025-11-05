import { GoogleGenerativeAI } from "@google/generative-ai";
import "dotenv/config";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash-exp",
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,
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
    "explanation": "Brief explanation of why this is correct and why others are wrong"
  }
]

CRITICAL REQUIREMENTS:
- correctAnswer MUST be the INDEX (0-3) of the correct option in the options array
- Return ONLY the JSON array, absolutely no other text before or after
- Ensure the JSON is properly formatted and valid
- Generate EXACTLY ${questionCount} questions`;

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

      return {
        question: String(q.question).trim(),
        options: sanitizedOptions,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation ? String(q.explanation).trim() : "",
        difficulty: difficulty,
      };
    });

    console.log(
      `✅ Successfully validated ${validatedQuestions.length} questions`
    );

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
      model: "gemini-2.0-flash-exp",
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 2048,
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
