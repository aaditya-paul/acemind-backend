// Middleware to track Gemini API calls with accurate token counting
const { trackApiCall } = require("./analyticsDB");

// Import centralized model configuration (ESM import converted to require)
let modelConfigModule;
(async () => {
  modelConfigModule = await import("./modelConfig.mjs");
})();

/**
 * Endpoints that actually use AI models and should have tokens/costs calculated
 * All other endpoints will skip token counting
 */
const AI_ENDPOINTS = new Set([
  "/api/generate-quiz",
  "/api/notes",
  "/api/expand-subtopics",
  "/api/doubt-chat",
  "/api/suggested-questions",
  "/api/syllabus-context",
  "/api/practice-questions",
]);

/**
 * Check if endpoint uses AI and should have tokens counted
 * @param {string} endpoint - API endpoint path
 * @returns {boolean} True if endpoint uses AI
 */
function isAIEndpoint(endpoint) {
  return AI_ENDPOINTS.has(endpoint);
}

/**
 * Get model for endpoint using centralized configuration
 * Returns null for non-AI endpoints
 * Falls back to inline mapping during initial load
 */
function getModelForEndpoint(endpoint) {
  // Skip model lookup for non-AI endpoints
  if (!isAIEndpoint(endpoint)) {
    return null;
  }

  // Use centralized config if loaded
  if (modelConfigModule?.getModelForEndpoint) {
    return modelConfigModule.getModelForEndpoint(endpoint);
  }

  // Fallback during initial load
  const modelMap = {
    "/api/generate-quiz": "gemini-2.5-flash",
    "/api/notes": "gemini-2.0-flash",
    "/api/expand-subtopics": "gemini-2.0-flash",
    "/api/doubt-chat": "gemini-2.0-flash",
    "/api/suggested-questions": "gemini-2.0-flash",
    "/api/syllabus-context": "gemini-2.0-flash",
    "/api/practice-questions": "gemini-2.5-flash",
  };

  return modelMap[endpoint] || null;
}

/**
 * Middleware to capture and track API responses
 * This intercepts the response to count tokens and calculate costs
 */
function analyticsMiddleware() {
  return (req, res, next) => {
    // Skip admin endpoints
    if (req.path.startsWith("/api/admin")) {
      return next();
    }

    // Only track API endpoints
    if (!req.path.startsWith("/api/")) {
      return next();
    }

    // Capture original json method
    const originalJson = res.json.bind(res);

    // Store request data and start timer
    const startTime = Date.now();

    // Extract userId from various possible locations
    let userId = "anonymous";
    if (req.body?.userId) {
      userId = req.body.userId;
    } else if (req.body?.uid) {
      userId = req.body.uid;
    } else if (req.body?.user_id) {
      userId = req.body.user_id;
    } else if (req.query?.userId) {
      userId = req.query.userId;
    } else if (req.headers?.["x-user-id"]) {
      userId = req.headers["x-user-id"];
    }

    const model = getModelForEndpoint(req.path);

    // Skip tracking for non-AI endpoints
    if (model === null) {
      return next();
    }

    const requestData = {
      endpoint: req.path,
      userId,
      model,
      input: req.body,
      timestamp: startTime,
      metadata: {
        method: req.method,
        userAgent: req.headers["user-agent"],
        ip: req.ip,
      },
    };

    // Override json method to capture response
    res.json = function (data) {
      // Calculate response time
      const responseTime = Date.now() - startTime;

      // Check if response contains error
      const hasError =
        data.success === false || data.error || res.statusCode >= 400;

      // Track the API call asynchronously (don't block response)
      setImmediate(() => {
        trackApiCall(
          requestData.endpoint,
          requestData.userId,
          requestData.model,
          requestData.input,
          data,
          {
            ...requestData.metadata,
            responseTime,
            statusCode: res.statusCode,
            error: hasError,
            errorMessage: hasError
              ? data.message || data.error || "Unknown error"
              : null,
          }
        ).catch((error) => {
          console.error("❌ Analytics tracking error:", error.message);
        });
      });

      // Send original response
      return originalJson(data);
    };

    next();
  };
}

module.exports = {
  analyticsMiddleware,
  getModelForEndpoint,
};
