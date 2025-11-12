/**
 * Retry utility for API calls with exponential backoff
 * Handles transient errors like 503, 429, 500
 */

/**
 * Rate limiting configuration
 */
export const RATE_LIMIT_CONFIG = {
  maxRetries: 3,
  baseDelay: 2000, // 2 seconds
  maxDelay: 30000, // 30 seconds
};

/**
 * Sleep utility for rate limiting
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry wrapper with exponential backoff for API calls
 * Handles 503 (Service Unavailable), 429 (Too Many Requests), and other transient errors
 *
 * @param {Function} apiCall - Async function to call (should return a Promise)
 * @param {string} callName - Name of the API call for logging purposes
 * @param {number} maxRetries - Maximum number of retry attempts (default: 3)
 * @returns {Promise<any>} - Result from the API call
 * @throws {Error} - Last error encountered if all retries fail
 *
 * @example
 * const result = await retryWithBackoff(
 *   async () => await api.generateContent(prompt),
 *   "GenerateNotes"
 * );
 */
export async function retryWithBackoff(
  apiCall,
  callName = "API call",
  maxRetries = RATE_LIMIT_CONFIG.maxRetries
) {
  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
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
        error.message?.includes("500") ||
        error.message?.includes("quota") ||
        error.message?.includes("rate limit") ||
        error.message?.includes("service unavailable") ||
        error.message?.includes("fetch failed") || // Network errors
        error.message?.includes("ECONNRESET") || // Connection reset
        error.message?.includes("ETIMEDOUT") || // Timeout
        error.code === "ECONNRESET" ||
        error.code === "ETIMEDOUT" ||
        error.code === "ENOTFOUND";

      if (isRetryableError && attempt < maxRetries - 1) {
        // Exponential backoff: 2s, 4s, 8s, etc.
        const delay = Math.min(
          RATE_LIMIT_CONFIG.baseDelay * Math.pow(2, attempt),
          RATE_LIMIT_CONFIG.maxDelay
        );

        console.warn(
          `⚠️  ${
            error.status === 503
              ? "Service unavailable"
              : error.status === 429
              ? "Rate limit"
              : "Transient error"
          } for ${callName}. Retrying in ${delay / 1000}s... (Attempt ${
            attempt + 1
          }/${maxRetries})`
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
