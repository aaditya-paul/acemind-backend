/**
 * Rate Limiting and Optimization Configuration
 *
 * This configuration helps manage API calls efficiently to avoid 429 errors
 * on free-tier Gemini API usage.
 */

export const RATE_LIMIT_CONFIG = {
  // Retry configuration
  maxRetries: 3, // Number of retry attempts for failed requests
  baseDelay: 2000, // Base delay in ms (2 seconds)
  maxDelay: 30000, // Maximum delay in ms (30 seconds)

  // Batch processing configuration
  useBatchProcessing: true, // Use batched API calls (RECOMMENDED)
  maxQuestionsPerBatch: 10, // Maximum questions per batch (adjust based on needs)

  // Request spacing (optional additional throttling)
  minDelayBetweenRequests: 1000, // Minimum 1 second between requests

  // Free tier limits (as of 2024)
  // Gemini Flash: 15 RPM (requests per minute), 1 million TPM (tokens per minute)
  // Adjust these based on your actual quota
  requestsPerMinute: 15,
  tokensPerMinute: 1000000,
};

/**
 * Calculate optimal batch size based on question count
 * Helps balance between API call reduction and token limits
 */
export function getOptimalBatchSize(questionCount) {
  if (questionCount <= 3) return questionCount; // Small batches: process all at once
  if (questionCount <= 5) return questionCount; // Medium batches: process all at once
  if (questionCount <= 10) return questionCount; // Large batches: process all at once

  // For very large batches (>10), split into chunks of 10
  return 10;
}

/**
 * Estimate token usage for a request
 * Rough estimation: ~4 characters = 1 token
 */
export function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

/**
 * Check if we should add delay based on rate limiting
 */
export function shouldThrottle(requestCount, timeWindow) {
  const requestsPerSecond = requestCount / (timeWindow / 1000);
  const requestsPerMinute = requestsPerSecond * 60;

  return requestsPerMinute >= RATE_LIMIT_CONFIG.requestsPerMinute * 0.8; // 80% threshold
}

/**
 * API call optimization strategies
 */
export const OPTIMIZATION_STRATEGIES = {
  // Strategy 1: Batch Processing (Current Implementation)
  // Reduces API calls from 1 + (2 × N) to just 3 total
  // Example: 5 questions = 11 calls → 3 calls (73% reduction)
  BATCH_PROCESSING: {
    name: "Batch Processing",
    description: "Process all questions in batched API calls",
    apiCalls: 3, // Always 3 calls regardless of question count
    pros: [
      "Massive reduction in API calls",
      "Consistent performance",
      "Better rate limit compliance",
    ],
    cons: [
      "Slightly higher token usage per call",
      "All-or-nothing (if one batch fails, need to retry all)",
    ],
  },

  // Strategy 2: Chunked Batch Processing (For large question sets)
  // For >10 questions, split into chunks
  CHUNKED_BATCH: {
    name: "Chunked Batch Processing",
    description: "Split large question sets into manageable chunks",
    calculateCalls: (questionCount) => {
      const chunkSize = 10;
      const chunks = Math.ceil(questionCount / chunkSize);
      return 1 + chunks * 2; // 1 for questions + chunks × (options + explanations)
    },
    pros: [
      "Handles large question sets",
      "Better error isolation",
      "Respects token limits",
    ],
    cons: ["More API calls than full batch", "More complex implementation"],
  },

  // Strategy 3: Caching (Future Enhancement)
  CACHING: {
    name: "Result Caching",
    description: "Cache previously generated questions for reuse",
    pros: [
      "Zero API calls for cached content",
      "Instant results",
      "Cost-effective",
    ],
    cons: ["Requires storage", "Less variety", "Cache invalidation complexity"],
  },
};

/**
 * Usage recommendations based on question count
 */
export function getRecommendation(questionCount) {
  if (questionCount <= 5) {
    return {
      strategy: "BATCH_PROCESSING",
      apiCalls: 3,
      estimatedTime: "10-15 seconds",
      recommendation: "Use standard batch processing - optimal for this size",
    };
  } else if (questionCount <= 10) {
    return {
      strategy: "BATCH_PROCESSING",
      apiCalls: 3,
      estimatedTime: "15-25 seconds",
      recommendation:
        "Batch processing recommended - near token limit but safe",
    };
  } else {
    return {
      strategy: "CHUNKED_BATCH",
      apiCalls: 1 + Math.ceil(questionCount / 10) * 2,
      estimatedTime: `${Math.ceil(questionCount / 10) * 15}-${
        Math.ceil(questionCount / 10) * 25
      } seconds`,
      recommendation:
        "Consider chunked batch processing or reducing question count",
    };
  }
}

/**
 * Free tier best practices
 */
export const FREE_TIER_BEST_PRACTICES = {
  dailyQuizLimit: 100, // Recommended max quizzes per day on free tier
  questionsPerQuiz: 5, // Optimal questions per quiz
  peakHourAvoidance: true, // Avoid peak hours if possible

  tips: [
    "✅ Use batch processing (enabled by default)",
    "✅ Keep question count ≤ 10 for optimal performance",
    "✅ Add delays between consecutive quiz generations",
    "✅ Monitor for 429 errors and implement backoff",
    "⚠️  Avoid generating >20 quizzes per hour",
    "⚠️  Consider caching frequently requested topics",
    "💡 Upgrade to paid tier for high-volume usage",
  ],
};

export default {
  RATE_LIMIT_CONFIG,
  OPTIMIZATION_STRATEGIES,
  getOptimalBatchSize,
  estimateTokens,
  shouldThrottle,
  getRecommendation,
  FREE_TIER_BEST_PRACTICES,
};
