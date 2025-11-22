/**
 * Centralized AI Model Configuration
 * Single source of truth for all Gemini models, pricing, and service mappings
 *
 * Last Updated: November 13, 2025
 * Pricing Source: https://ai.google.dev/pricing
 */

// USD to INR conversion rate (update periodically)
export const USD_TO_INR = 88.58;

/**
 * Gemini Model Pricing Configuration
 * All prices are per 1 Million tokens
 */
export const MODEL_PRICING = {
  // Gemini 2.5 Models - Latest Generation (Highest Accuracy)
  "gemini-2.5-flash": {
    input: 0.3, // $0.30 per 1M tokens
    output: 2.5, // $2.50 per 1M tokens
    description: "Flash 2.5 - Hybrid Reasoning, 1M context",
    tier: "premium",
    contextWindow: 1_000_000,
  },
  "gemini-2.5-flash-preview": {
    input: 0.3,
    output: 2.5,
    description: "Flash 2.5 Preview - Large scale processing",
    tier: "premium",
    contextWindow: 1_000_000,
  },
  "gemini-2.5-flash-lite": {
    input: 0.1,
    output: 0.4,
    description: "Flash 2.5 Lite - Most cost effective 2.5",
    tier: "standard",
    contextWindow: 1_000_000,
  },
  "gemini-2.5-pro": {
    input: 1.25, // $1.25 per 1M tokens (≤200k tokens)
    output: 10.0, // $10.00 per 1M tokens
    description: "Pro 2.5 - State-of-the-art, excels at coding",
    tier: "ultra",
    contextWindow: 2_000_000,
  },

  // Gemini 2.0 Models - Current Generation (Balanced)
  "gemini-2.0-flash": {
    input: 0.1, // $0.10 per 1M tokens
    output: 0.4, // $0.40 per 1M tokens
    description: "Flash 2.0 - Balanced, built for Agents",
    tier: "standard",
    contextWindow: 1_000_000,
  },
  "gemini-2.0-flash-lite": {
    input: 0.075, // $0.075 per 1M tokens
    output: 0.3, // $0.30 per 1M tokens
    description: "Flash 2.0 Lite - Most cost effective 2.0",
    tier: "economy",
    contextWindow: 1_000_000,
  },
  "gemini-2.0-flash-exp": {
    input: 0.0, // FREE (Experimental)
    output: 0.0,
    description: "Flash 2.0 Exp - FREE (Free Tier Only)",
    tier: "free",
    contextWindow: 1_000_000,
  },

  // Gemini 1.5 Models - Previous Generation (Legacy)
  "gemini-1.5-flash": {
    input: 0.075,
    output: 0.3,
    description: "Flash 1.5 - Previous gen, still available",
    tier: "economy",
    contextWindow: 1_000_000,
  },
  "gemini-1.5-pro": {
    input: 1.25,
    output: 5.0,
    description: "Pro 1.5 - Advanced previous gen",
    tier: "premium",
    contextWindow: 2_000_000,
  },
};

/**
 * Service-to-Model Mapping
 * Defines which model each service should use based on accuracy requirements
 *
 * Strategy:
 * - CRITICAL: Use 2.5-flash for quiz generation (factual accuracy is paramount)
 * - HIGH: Use 2.0-flash for notes and syllabus (balanced accuracy/cost)
 * - MEDIUM: Use 2.0-flash-lite for chat and suggestions (cost-effective)
 */
export const SERVICE_MODEL_MAP = {
  // CRITICAL ACCURACY SERVICES - Quiz Generation (Multi-Stage)
  "generate-quiz": {
    model: "gemini-2.5-flash-lite",
    reason: "Quiz questions MUST be factually correct",
    accuracy: "critical",
    stages: {
      // Stage 1: Generate questions only
      questions: {
        model: "gemini-2.5-flash-lite",
        temperature: 0.7,
        reason: "Generate clear, concise questions",
      },
      // Stage 2: Generate options for all questions (batched)
      options: {
        model: "gemini-2.5-flash",
        temperature: 0.3,
        reason: "Generate accurate multiple-choice options",
      },
      // Stage 3: Generate explanations for all questions (batched)
      explanations: {
        model: "gemini-2.5-flash",
        temperature: 0.3,
        reason: "Generate brief, to-the-point explanations",
      },
      // Stage 4: AI fact-checking and correction (NEW)
      "fact-check": {
        model: "gemini-2.5-flash", // Upgraded from lite for better reasoning
        temperature: 0.1, // ULTRA-LOW: Maximum accuracy for validation
        reason: "Verify and correct all questions for accuracy",
      },
    },
  },

  // Practice questions (non-quiz format)
  "practice-questions": {
    model: "gemini-2.5-flash-lite",
    reason: "Practice questions need good accuracy",
    accuracy: "high",
  },

  // HIGH ACCURACY SERVICES
  notes: {
    model: "gemini-2.5-flash-lite",
    reason: "Educational notes need good accuracy",
    accuracy: "high",
  },
  syllabus: {
    model: "gemini-2.5-flash-lite",
    reason: "Syllabus parsing needs accuracy",
    accuracy: "high",
  },
  "syllabus-context": {
    model: "gemini-2.5-flash-lite",
    reason: "Context generation needs accuracy",
    accuracy: "high",
  },

  // MEDIUM ACCURACY SERVICES (Cost-optimized)
  "expand-subtopics": {
    model: "gemini-2.5-flash-lite",
    reason: "Subtopic suggestions can be more flexible",
    accuracy: "medium",
  },
  "doubt-chat": {
    model: "gemini-2.5-flash-lite",
    reason: "Conversational, doesn't need highest accuracy",
    accuracy: "medium",
  },
  "suggested-questions": {
    model: "gemini-2.5-flash-lite",
    reason: "Question suggestions can be creative",
    accuracy: "medium",
  },
};

/**
 * API Endpoint to Service Name Mapping
 * Maps Express.js endpoints to service names
 */
export const ENDPOINT_TO_SERVICE = {
  "/api/generate-quiz": "generate-quiz",
  "/api/practice-questions": "practice-questions",
  "/api/notes": "notes",
  "/api/submit": "syllabus",
  "/api/expand-subtopics": "expand-subtopics",
  "/api/doubt-chat": "doubt-chat",
  "/api/suggested-questions": "suggested-questions",
  "/api/syllabus-context": "syllabus-context",
};

/**
 * Get model for a specific service
 * @param {string} serviceName - Service name (e.g., "generate-quiz", "notes")
 * @param {string} stage - Optional stage name for multi-stage services (e.g., "questions", "options", "explanations")
 * @returns {string} Model name (e.g., "gemini-2.5-flash")
 */
export function getModelForService(serviceName, stage = null) {
  const serviceConfig = SERVICE_MODEL_MAP[serviceName];
  if (!serviceConfig) {
    console.warn(
      `⚠️ No model mapping for service: ${serviceName}, using default 2.0-flash`
    );
    return "gemini-2.0-flash";
  }

  // If stage is specified and exists, return stage-specific model
  if (stage && serviceConfig.stages && serviceConfig.stages[stage]) {
    return serviceConfig.stages[stage].model;
  }

  return serviceConfig.model;
}

/**
 * Get configuration for a specific quiz generation stage
 * @param {string} stage - Stage name ("questions", "options", "explanations")
 * @returns {Object} Stage configuration including model and temperature
 */
export function getQuizStageConfig(stage) {
  const quizConfig = SERVICE_MODEL_MAP["generate-quiz"];
  if (!quizConfig || !quizConfig.stages || !quizConfig.stages[stage]) {
    console.warn(`⚠️ No config for quiz stage: ${stage}, using default`);
    return {
      model: "gemini-2.5-flash",
      temperature: 0.7,
      reason: "Default quiz generation",
    };
  }
  return quizConfig.stages[stage];
}

/**
 * Get model for an API endpoint
 * @param {string} endpoint - API endpoint (e.g., "/api/generate-quiz")
 * @returns {string} Model name (e.g., "gemini-2.5-flash")
 */
export function getModelForEndpoint(endpoint) {
  const serviceName = ENDPOINT_TO_SERVICE[endpoint];
  if (!serviceName) {
    console.warn(
      `⚠️ No service mapping for endpoint: ${endpoint}, using default 2.0-flash`
    );
    return "gemini-2.0-flash";
  }
  return getModelForService(serviceName);
}

/**
 * Get pricing for a specific model
 * @param {string} modelName - Model name (e.g., "gemini-2.5-flash")
 * @returns {Object} Pricing information
 */
export function getModelPricing(modelName) {
  const pricing = MODEL_PRICING[modelName];
  if (!pricing) {
    console.warn(
      `⚠️ No pricing for model: ${modelName}, using default 2.0-flash pricing`
    );
    return MODEL_PRICING["gemini-2.0-flash"];
  }
  return pricing;
}

/**
 * Calculate cost for API call
 * @param {string} modelName - Model name
 * @param {number} inputTokens - Number of input tokens
 * @param {number} outputTokens - Number of output tokens
 * @returns {Object} Cost breakdown in USD and INR
 */
export function calculateCost(modelName, inputTokens, outputTokens) {
  const pricing = getModelPricing(modelName);

  // Calculate cost per million tokens
  const inputCostUSD = (inputTokens / 1_000_000) * pricing.input;
  const outputCostUSD = (outputTokens / 1_000_000) * pricing.output;
  const totalCostUSD = inputCostUSD + outputCostUSD;

  return {
    model: modelName,
    modelDescription: pricing.description,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    costs: {
      inputUSD: inputCostUSD,
      outputUSD: outputCostUSD,
      totalUSD: totalCostUSD,
      inputINR: inputCostUSD * USD_TO_INR,
      outputINR: outputCostUSD * USD_TO_INR,
      totalINR: totalCostUSD * USD_TO_INR,
    },
    pricing: {
      inputPer1M: pricing.input,
      outputPer1M: pricing.output,
    },
  };
}

/**
 * Get service configuration with model and pricing details
 * @param {string} serviceName - Service name
 * @returns {Object} Complete service configuration
 */
export function getServiceConfig(serviceName) {
  const serviceMapping = SERVICE_MODEL_MAP[serviceName];
  if (!serviceMapping) {
    return null;
  }

  const modelName = serviceMapping.model;
  const pricing = getModelPricing(modelName);

  return {
    service: serviceName,
    model: modelName,
    accuracy: serviceMapping.accuracy,
    reason: serviceMapping.reason,
    pricing: {
      inputPer1M: pricing.input,
      outputPer1M: pricing.output,
      description: pricing.description,
      tier: pricing.tier,
    },
  };
}

/**
 * Export all models grouped by tier for easy reference
 */
export const MODELS_BY_TIER = {
  ultra: Object.keys(MODEL_PRICING).filter(
    (k) => MODEL_PRICING[k].tier === "ultra"
  ),
  premium: Object.keys(MODEL_PRICING).filter(
    (k) => MODEL_PRICING[k].tier === "premium"
  ),
  standard: Object.keys(MODEL_PRICING).filter(
    (k) => MODEL_PRICING[k].tier === "standard"
  ),
  economy: Object.keys(MODEL_PRICING).filter(
    (k) => MODEL_PRICING[k].tier === "economy"
  ),
  free: Object.keys(MODEL_PRICING).filter(
    (k) => MODEL_PRICING[k].tier === "free"
  ),
};

/**
 * Utility: Print all service configurations (for debugging)
 */
export function printServiceConfigurations() {
  console.log("\n🎯 SERVICE MODEL CONFIGURATIONS\n");
  console.log("=".repeat(80));

  for (const [serviceName, config] of Object.entries(SERVICE_MODEL_MAP)) {
    const fullConfig = getServiceConfig(serviceName);
    console.log(
      `\n📌 ${serviceName.toUpperCase()} (${fullConfig.accuracy} accuracy)`
    );
    console.log(`   Model: ${fullConfig.model}`);
    console.log(`   Reason: ${fullConfig.reason}`);
    console.log(
      `   Cost: $${fullConfig.pricing.inputPer1M}/$${fullConfig.pricing.outputPer1M} per 1M tokens`
    );
  }

  console.log("\n" + "=".repeat(80) + "\n");
}
