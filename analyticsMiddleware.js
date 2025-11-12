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
    "/api/doubt-chat": "gemini-2.5-flash", // PAID - uses 2.5-flash for quality
    "/api/generate-quiz": "gemini-2.5-flash", // PAID - uses 2.5-flash for quality
    "/api/suggested-questions": "gemini-2.5-flash", // PAID - uses 2.5-flash for quality
  };

  return modelMap[endpoint] || "";
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

    const requestData = {
      endpoint: req.path,
      userId,
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
