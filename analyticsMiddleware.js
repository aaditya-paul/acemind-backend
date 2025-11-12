// Middleware to track Gemini API calls with accurate token counting
const { trackApiCall } = require("./analyticsDB");

/**
 * Extract model from request based on endpoint
 * Different endpoints use different models based on accuracy requirements and cost
 *
 * Model Selection Strategy:
 * - gemini-2.5-flash: Highest accuracy, use ONLY for quiz generation ($0.30/$2.50 per 1M tokens)
 * - gemini-2.0-flash: Balanced accuracy/cost, use for notes and syllabus ($0.10/$0.40 per 1M tokens)
 * - gemini-2.0-flash-lite: Most cost-effective, use for chat/suggestions ($0.075/$0.30 per 1M tokens)
 */
function getModelForEndpoint(endpoint) {
  const modelMap = {
    // CRITICAL ACCURACY - Use 2.5-flash (most expensive but most accurate)
    "/api/generate-quiz": "gemini-2.5-flash", // Quiz questions MUST be factually correct

    // HIGH ACCURACY - Use 2.0-flash (balanced cost/accuracy)
    "/api/submit": "gemini-2.0-flash", // Syllabus parsing needs accuracy
    "/api/notes": "gemini-2.0-flash", // Educational notes need accuracy

    // MEDIUM ACCURACY - Use 2.0-flash-lite (most cost-effective)
    "/api/expand-subtopics": "gemini-2.0-flash-lite", // Subtopic suggestions can be more flexible
    "/api/doubt-chat": "gemini-2.0-flash-lite", // Conversational, doesn't need highest accuracy
    "/api/suggested-questions": "gemini-2.0-flash-lite", // Question suggestions can be creative
  };

  return modelMap[endpoint] || "gemini-2.0-flash"; // Default to balanced model
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
