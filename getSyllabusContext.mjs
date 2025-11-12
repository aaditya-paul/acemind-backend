import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

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

export async function GetSyllabusContext(topic, syllabus) {
  const googleGenAI = new GoogleGenAI({
    apiKey: process.env.GOOGLE_API_KEY,
  });

  const prompt = `Provide a short context to store on db and provide as context to llms for the syllabus on the topic: ${topic}. Syllabus details: ${syllabus}
  Instructions :

  Dont include ai text in the response. only provide the context text.
    The context should be a short summary of the syllabus, not more than 150 words.
  `;

  const response = await retryWithBackoff(
    async () =>
      await googleGenAI.models.generateContent({
        model: "gemini-2.0-flash", // Cost optimization: $0.10/$0.40 (3x cheaper than 2.5-flash)
        contents: [
          {
            role: "user",
            text: prompt,
          },
        ],
      }),
    "GetSyllabusContext"
  );

  return response;
}
