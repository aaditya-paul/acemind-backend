// Middleware to track Gemini API calls with accurate token counting
const { trackApiCall } = require("./analyticsDB");

/**
 * Extract model from request based on endpoint
 * Different endpoints use different models
 */
function getModelForEndpoint(endpoint) {
  const modelMap = {
    "/api/submit": "gemini-2.5-flash",
    "/api/expand-subtopics": "gemini-2.5-flash",
    "/api/notes": "gemini-2.5-flash",
    "/api/doubt-chat": "gemini-2.0-flash-exp", // FREE
    "/api/generate-quiz": "gemini-2.0-flash-exp", // FREE
    "/api/suggested-questions": "gemini-2.0-flash-exp", // FREE
  };

  return modelMap[endpoint] || "gemini-2.5-flash";
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
    const requestData = {
      endpoint: req.path,
      userId: req.body?.userId || req.body?.uid || "anonymous",
      model: getModelForEndpoint(req.path),
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
