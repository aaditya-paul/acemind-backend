import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { retryWithBackoff } from "./retryUtils.mjs";
import { getModelForService } from "./modelConfig.mjs";

dotenv.config();

/**
 * Processes doubt/question with context using Gemini AI
 * @param {string} question - The user's question
 * @param {string} context - The learning context (current topic + related topics)
 * @param {string|null} selectedText - Specific text selected by user for focus
 * @param {Array} conversationHistory - Previous messages for context
 * @returns {Promise<string>} - AI's answer
 */
export async function ProcessDoubtWithGemini(
  question,
  context,
  selectedText = null,
  conversationHistory = []
) {
  const genAI = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || "YOUR_BACKUP_API_KEY_HERE",
  });

  // Build the conversation history
  let conversationContext = "";
  if (conversationHistory.length > 0) {
    conversationContext = "\n## Previous Conversation:\n";
    conversationHistory.forEach((msg) => {
      const role = msg.role === "user" ? "Student" : "AI Tutor";
      conversationContext += `**${role}:** ${msg.content}\n\n`;
    });
  }

  // Build the prompt with focus on selected text if available
  const prompt = `
You are an intelligent AI tutor helping a student understand their learning material. 
You have access to ${
    context.includes("General Learning Context")
      ? "general knowledge"
      : "the full context of what the student is currently learning"
  }, and you should provide clear, helpful, and educational answers.

## Your Role:
- Provide accurate, concise, and easy-to-understand explanations
- Use examples and analogies when helpful
- Break down complex concepts into simpler parts
- Encourage learning by asking follow-up questions when appropriate
- If the student has selected specific text, focus primarily on that while using the broader context for reference
${
  context.includes("General Learning Context")
    ? "- Since no specific learning context is available, provide general educational assistance"
    : ""
}

## Learning Context:
${context}

${
  selectedText
    ? `\n## Student's Selected Text (PRIMARY FOCUS):\n${selectedText}\n`
    : ""
}

${conversationContext}

## Current Question from Student:
${question}

## Instructions:
${
  selectedText
    ? `- FOCUS PRIMARILY on explaining or answering about the selected text above
  - Use the broader context only to provide additional clarity or examples
  - Reference the selected text directly in your answer`
    : context.includes("General Learning Context")
    ? `- Provide a general educational answer to the best of your ability
  - Ask clarifying questions if needed to provide better assistance
  - Suggest what specific context or information would help give a more targeted answer`
    : `- Answer based on the learning context provided above
  - Draw connections between different topics when relevant
  - Be comprehensive but concise`
}
- Use markdown formatting for better readability (bold, italic, code blocks, lists, etc.)
- If the question is unclear, ask for clarification
- If you don't know the answer, be honest and suggest what information might help

Please provide your answer now:
`;

  try {
    console.log("🤔 Processing doubt with Gemini...");
    console.log("❓ Question:", question);
    console.log("📌 Has selected text:", !!selectedText);
    console.log("💬 Conversation history length:", conversationHistory.length);

    const model = getModelForService("doubt-chat");
    const response = await retryWithBackoff(
      async () =>
        await genAI.models.generateContent({
          model: model,
          contents: [{ role: "user", text: prompt }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
            topP: 0.9,
          },
        }),
      "ProcessDoubtWithGemini"
    );

    const answer = response.text;
    console.log("✅ Doubt processed successfully");

    return answer;
  } catch (err) {
    console.error("❌ Error processing doubt:", err.message);
    throw new Error(`Failed to process doubt: ${err.message}`);
  }
}

/**
 * Generates follow-up questions based on the current topic
 * @param {string} topic - The current topic title
 * @param {string} context - Brief context about the topic
 * @returns {Promise<Array<string>>} - Array of suggested questions
 */
export async function GenerateSuggestedQuestions(topic, context) {
  const genAI = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || "YOUR_BACKUP_API_KEY_HERE",
  });

  const prompt = `
Based on the following topic and context, generate 3-5 thoughtful questions that a student might want to ask to deepen their understanding.

Topic: ${topic}

Context:
${context.substring(0, 1000)}

Generate questions that:
- Help clarify key concepts
- Explore practical applications
- Connect to related topics
- Encourage critical thinking

Return ONLY a JSON array of strings, like: ["Question 1?", "Question 2?", "Question 3?"]
`;

  try {
    const model = getModelForService("suggested-questions");
    const response = await retryWithBackoff(
      async () =>
        await genAI.models.generateContent({
          model: model,
          contents: [{ role: "user", text: prompt }],
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 512,
          },
        }),
      "GenerateSuggestedQuestions"
    );

    const text = response.text;
    // Extract JSON array from response
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      return JSON.parse(match[0]);
    }

    return [];
  } catch (err) {
    console.error("❌ Error generating questions:", err.message);
    return [];
  }
}
