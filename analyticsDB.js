// Token counting and cost calculation utility
const { getFirestoreDB } = require("./firebaseAdmin");

// Import centralized model configuration
let modelConfigModule;
let PRICING = {}; // Will be populated from modelConfig
let USD_TO_INR = 88.58; // Default value

// Load ESM module asynchronously
(async () => {
  try {
    modelConfigModule = await import("./modelConfig.mjs");
    // Convert ESM MODEL_PRICING format to match existing PRICING structure
    PRICING = {};
    for (const [modelName, config] of Object.entries(
      modelConfigModule.MODEL_PRICING
    )) {
      PRICING[modelName] = {
        input: config.input,
        output: config.output,
        description: config.description,
      };
    }
    USD_TO_INR = modelConfigModule.USD_TO_INR;
    console.log("✅ Model pricing loaded from centralized config");
  } catch (error) {
    console.warn(
      "⚠️ Could not load centralized config, using fallback pricing"
    );
    // Fallback pricing if module fails to load
    PRICING = {
      "gemini-2.5-flash": {
        input: 0.3,
        output: 2.5,
        description: "Flash 2.5 - Hybrid Reasoning, 1M context",
      },
      "gemini-2.0-flash": {
        input: 0.1,
        output: 0.4,
        description: "Flash 2.0 - Balanced, built for Agents",
      },
      "gemini-2.0-flash-lite": {
        input: 0.075,
        output: 0.3,
        description: "Flash 2.0 Lite - Most cost effective 2.0",
      },
    };
  }
})();

/**
 * Sanitize endpoint name for use as Firestore field name
 * Firestore doesn't allow slashes or dots in field paths
 * Converts /api/expand-subtopics -> _api_expand-subtopics
 */
function sanitizeEndpointName(endpoint) {
  return endpoint.replace(/\//g, "_").replace(/\./g, "_");
}

/**
 * Unsanitize endpoint name back to original format
 * Converts _api_expand-subtopics -> /api/expand-subtopics
 */
function unsanitizeEndpointName(sanitized) {
  // Only unsanitize if it starts with _api_
  if (sanitized.startsWith("_api_")) {
    return sanitized.replace(/_/g, "/").replace(/\/api\//, "/api/");
  }
  return sanitized;
}

/**
 * Estimate token count for text
 * Gemini uses similar tokenization to GPT models (~4 chars per token)
 * For accurate counting, we approximate: 1 token ≈ 4 characters
 */
function estimateTokenCount(text) {
  if (!text) return 0;

  // Convert to string if not already
  const textStr = typeof text === "string" ? text : JSON.stringify(text);

  // Rough estimation: 1 token ≈ 4 characters
  // This is a conservative estimate that's reasonably accurate for English text
  return Math.ceil(textStr.length / 4);
}

/**
 * Calculate cost for API call
 * @param {string} model - Model name (e.g., "gemini-2.5-flash")
 * @param {number} inputTokens - Number of input tokens
 * @param {number} outputTokens - Number of output tokens
 * @returns {Object} Cost breakdown in USD and INR
 */
function calculateCost(model, inputTokens, outputTokens) {
  const pricing = PRICING[model] || PRICING["gemini-2.5-flash"]; // Default to flash

  // Calculate cost per million tokens
  const inputCostUSD = (inputTokens / 1_000_000) * pricing.input;
  const outputCostUSD = (outputTokens / 1_000_000) * pricing.output;
  const totalCostUSD = inputCostUSD + outputCostUSD;

  return {
    model,
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
 * Track API call in Firestore with accurate token counting
 * @param {string} endpoint - API endpoint (e.g., "/api/notes")
 * @param {string} userId - User ID
 * @param {string} model - Gemini model used
 * @param {string|Object} input - Input prompt/request
 * @param {string|Object} output - AI response
 * @param {Object} metadata - Additional metadata
 */
async function trackApiCall(
  endpoint,
  userId,
  model,
  input,
  output,
  metadata = {}
) {
  try {
    const db = getFirestoreDB();
    const timestamp = Date.now();
    const date = new Date(timestamp).toISOString().split("T")[0];

    // Count tokens only if not an error
    const inputTokens = metadata.error ? 0 : estimateTokenCount(input);
    const outputTokens = metadata.error ? 0 : estimateTokenCount(output);

    // Calculate cost (only if not an error - errors don't cost money)
    const costBreakdown = metadata.error
      ? { costs: { totalUSD: 0, totalINR: 0 } }
      : calculateCost(model, inputTokens, outputTokens);

    // Prepare API call document
    const apiCallDoc = {
      endpoint,
      userId: userId || "anonymous",
      model,
      timestamp,
      date,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      costUSD: costBreakdown.costs.totalUSD,
      costINR: costBreakdown.costs.totalINR,
      // NEW: Track response time, errors, and full response data
      responseTime: metadata.responseTime || 0,
      statusCode: metadata.statusCode || 200,
      error: metadata.error || null,
      errorMessage: metadata.errorMessage || null,
      // Store request/response data for detailed analysis
      requestData:
        typeof input === "string"
          ? input.substring(0, 1000)
          : JSON.stringify(input).substring(0, 1000),
      responseData: metadata.error
        ? null
        : typeof output === "string"
        ? output.substring(0, 1000)
        : JSON.stringify(output).substring(0, 1000),
      metadata: {
        ...metadata,
        userAgent: metadata.userAgent || "unknown",
        method: metadata.method || "POST",
      },
    };

    // Store in Firestore: analytics/apiCalls/{callId}
    await db
      .collection("analytics")
      .doc("apiCalls")
      .collection("calls")
      .add(apiCallDoc);

    // Update daily stats atomically
    const dailyStatsRef = db
      .collection("analytics")
      .doc("dailyStats")
      .collection("dates")
      .doc(date);

    await db.runTransaction(async (transaction) => {
      const dailyDoc = await transaction.get(dailyStatsRef);
      const sanitizedEndpoint = sanitizeEndpointName(endpoint);

      if (!dailyDoc.exists) {
        // Create new daily stats
        transaction.set(dailyStatsRef, {
          date,
          totalCalls: 1,
          totalErrors: metadata.error ? 1 : 0,
          uniqueUsers: [userId],
          endpoints: { [sanitizedEndpoint]: 1 },
          totalTokens: apiCallDoc.totalTokens,
          inputTokens: inputTokens,
          outputTokens: outputTokens,
          costUSD: costBreakdown.costs.totalUSD,
          costINR: costBreakdown.costs.totalINR,
          models: { [model]: 1 },
          totalResponseTime: metadata.responseTime || 0,
        });
      } else {
        // Update existing stats
        const data = dailyDoc.data();
        const uniqueUsers = data.uniqueUsers || [];

        // Add user if not already in list (prevent duplicates)
        if (!uniqueUsers.includes(userId)) {
          uniqueUsers.push(userId);
        }

        const sanitizedEndpoint = sanitizeEndpointName(endpoint);
        transaction.update(dailyStatsRef, {
          totalCalls: (data.totalCalls || 0) + 1,
          totalErrors: (data.totalErrors || 0) + (metadata.error ? 1 : 0),
          uniqueUsers,
          [`endpoints.${sanitizedEndpoint}`]:
            ((data.endpoints || {})[sanitizedEndpoint] || 0) + 1,
          totalTokens: (data.totalTokens || 0) + apiCallDoc.totalTokens,
          inputTokens: (data.inputTokens || 0) + inputTokens,
          outputTokens: (data.outputTokens || 0) + outputTokens,
          costUSD: (data.costUSD || 0) + costBreakdown.costs.totalUSD,
          costINR: (data.costINR || 0) + costBreakdown.costs.totalINR,
          [`models.${model}`]: ((data.models || {})[model] || 0) + 1,
          totalResponseTime:
            (data.totalResponseTime || 0) + (metadata.responseTime || 0),
        });
      }
    });

    // Update user stats
    const userStatsRef = db
      .collection("analytics")
      .doc("userStats")
      .collection("users")
      .doc(userId);

    await db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userStatsRef);

      const sanitizedEndpoint = sanitizeEndpointName(endpoint);

      if (!userDoc.exists) {
        transaction.set(userStatsRef, {
          userId,
          firstSeen: timestamp,
          lastSeen: timestamp,
          totalCalls: 1,
          endpoints: { [sanitizedEndpoint]: 1 },
          totalTokens: apiCallDoc.totalTokens,
          inputTokens: inputTokens,
          outputTokens: outputTokens,
          costUSD: costBreakdown.costs.totalUSD,
          costINR: costBreakdown.costs.totalINR,
          models: { [model]: 1 },
        });
      } else {
        const data = userDoc.data();
        transaction.update(userStatsRef, {
          lastSeen: timestamp,
          totalCalls: (data.totalCalls || 0) + 1,
          [`endpoints.${sanitizedEndpoint}`]:
            ((data.endpoints || {})[sanitizedEndpoint] || 0) + 1,
          totalTokens: (data.totalTokens || 0) + apiCallDoc.totalTokens,
          inputTokens: (data.inputTokens || 0) + inputTokens,
          outputTokens: (data.outputTokens || 0) + outputTokens,
          costUSD: (data.costUSD || 0) + costBreakdown.costs.totalUSD,
          costINR: (data.costINR || 0) + costBreakdown.costs.totalINR,
          [`models.${model}`]: ((data.models || {})[model] || 0) + 1,
        });
      }
    });

    if (metadata.error) {
      console.log(
        `❌ Tracked Error: ${endpoint} | User: ${userId.slice(
          0,
          8
        )}... | Error: ${metadata.errorMessage || "Unknown"}`
      );
    } else {
      console.log(
        `📊 Tracked: ${endpoint} | User: ${userId.slice(0, 8)}... | Tokens: ${
          apiCallDoc.totalTokens
        } | Cost: ₹${costBreakdown.costs.totalINR.toFixed(4)}`
      );
    }

    return costBreakdown;
  } catch (error) {
    console.error("⚠️ Error tracking API call:", error.message);
    return null;
  }
}

/**
 * Get analytics summary
 */
async function getAnalyticsSummary(days = 30) {
  try {
    const db = getFirestoreDB();
    const now = Date.now();
    const startDate = new Date(now - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    // Get daily stats for the period
    const dailyStatsSnapshot = await db
      .collection("analytics")
      .doc("dailyStats")
      .collection("dates")
      .where("date", ">=", startDate)
      .orderBy("date", "desc")
      .get();

    // Get recent API calls (last 100)
    const recentCallsSnapshot = await db
      .collection("analytics")
      .doc("apiCalls")
      .collection("calls")
      .orderBy("timestamp", "desc")
      .limit(100)
      .get();

    // Get top users
    const topUsersSnapshot = await db
      .collection("analytics")
      .doc("userStats")
      .collection("users")
      .orderBy("totalCalls", "desc")
      .limit(10)
      .get();

    // Process daily stats
    let totalCalls = 0;
    let totalErrors = 0;
    let totalCostINR = 0;
    let totalTokens = 0;
    let totalResponseTime = 0;
    let allUniqueUsers = new Set();
    const endpointCount = {};
    const modelCount = {};

    dailyStatsSnapshot.forEach((doc) => {
      const data = doc.data();
      totalCalls += data.totalCalls || 0;
      totalErrors += data.totalErrors || 0;
      totalCostINR += data.costINR || 0;
      totalTokens += data.totalTokens || 0;
      totalResponseTime += data.totalResponseTime || 0;

      (data.uniqueUsers || []).forEach((user) => allUniqueUsers.add(user));

      // Aggregate endpoints (unsanitize names for display)
      Object.entries(data.endpoints || {}).forEach(([endpoint, count]) => {
        const originalEndpoint = unsanitizeEndpointName(endpoint);
        endpointCount[originalEndpoint] =
          (endpointCount[originalEndpoint] || 0) + count;
      });

      // Aggregate models
      Object.entries(data.models || {}).forEach(([model, count]) => {
        modelCount[model] = (modelCount[model] || 0) + count;
      });
    });

    // Process recent calls
    const recentCalls = [];
    recentCallsSnapshot.forEach((doc) => {
      recentCalls.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    // Process top users
    const topUsers = [];
    topUsersSnapshot.forEach((doc) => {
      const data = doc.data();
      topUsers.push({
        userId: doc.id,
        totalCalls: data.totalCalls,
        costINR: data.costINR,
        totalTokens: data.totalTokens,
        lastSeen: data.lastSeen,
      });
    });

    // Calculate 24h and 7d stats
    const last24h = now - 24 * 60 * 60 * 1000;
    const last7d = now - 7 * 24 * 60 * 60 * 1000;

    const calls24h = recentCalls.filter((c) => c.timestamp >= last24h).length;
    const calls7d = recentCalls.filter((c) => c.timestamp >= last7d).length;
    const errors24h = recentCalls.filter(
      (c) => c.timestamp >= last24h && c.error
    ).length;

    // Count total registered users from actual user collection (signed up users)
    const registeredUsersSnapshot = await db.collection("users").get();

    // Count users who have made API calls (from analytics)
    const analyticsUsersSnapshot = await db
      .collection("analytics")
      .doc("userStats")
      .collection("users")
      .get();

    return {
      overview: {
        totalApiCalls: totalCalls,
        activeUsers: allUniqueUsers.size, // Active users in the selected period
        totalRegisteredUsers: registeredUsersSnapshot.size, // Total signed up users
        totalApiUsers: analyticsUsersSnapshot.size, // Users who have made at least one API call
        totalTokens,
        totalCostINR,
        totalCostUSD: totalCostINR / USD_TO_INR,
        totalErrors,
        errorRate:
          totalCalls > 0 ? ((totalErrors / totalCalls) * 100).toFixed(2) : 0,
        avgResponseTime:
          totalCalls > 0 ? Math.round(totalResponseTime / totalCalls) : 0,
        period: `Last ${days} days`,
      },
      calls: {
        last24h: calls24h,
        last7d: calls7d,
        last30d: totalCalls,
      },
      errors: {
        total: totalErrors,
        last24h: errors24h,
        errorRate:
          totalCalls > 0 ? ((totalErrors / totalCalls) * 100).toFixed(2) : 0,
      },
      costs: {
        totalINR: totalCostINR,
        totalUSD: totalCostINR / USD_TO_INR,
        avgPerCall: totalCalls > 0 ? totalCostINR / totalCalls : 0,
      },
      tokens: {
        total: totalTokens,
        avgPerCall: totalCalls > 0 ? Math.round(totalTokens / totalCalls) : 0,
      },
      performance: {
        avgResponseTime:
          totalCalls > 0 ? Math.round(totalResponseTime / totalCalls) : 0,
        totalResponseTime,
      },
      topEndpoints: Object.entries(endpointCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([endpoint, count]) => ({ endpoint, count })),
      topModels: Object.entries(modelCount)
        .sort((a, b) => b[1] - a[1])
        .map(([model, count]) => ({ model, count })),
      topUsers,
      recentCalls: recentCalls.slice(0, 50),
    };
  } catch (error) {
    console.error("⚠️ Error getting analytics summary:", error.message);
    throw error;
  }
}

/**
 * Get daily stats for charts
 */
async function getDailyStats(days = 30) {
  try {
    const db = getFirestoreDB();
    const now = Date.now();
    const dates = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now - i * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
      dates.push(date);
    }

    const dailyStatsSnapshot = await db
      .collection("analytics")
      .doc("dailyStats")
      .collection("dates")
      .where("date", "in", dates)
      .get();

    const statsMap = {};
    dailyStatsSnapshot.forEach((doc) => {
      statsMap[doc.id] = doc.data();
    });

    return dates.map((date) => {
      const stats = statsMap[date];
      const totalCalls = stats?.totalCalls || 0;
      const totalErrors = stats?.totalErrors || 0;
      const totalResponseTime = stats?.totalResponseTime || 0;

      return {
        date,
        calls: totalCalls,
        errors: totalErrors,
        users: stats?.uniqueUsers?.length || 0,
        costINR: stats?.costINR || 0,
        costUSD: stats?.costUSD || 0,
        tokens: stats?.totalTokens || 0,
        avgResponseTime:
          totalCalls > 0 ? Math.round(totalResponseTime / totalCalls) : 0,
        errorRate:
          totalCalls > 0 ? ((totalErrors / totalCalls) * 100).toFixed(2) : 0,
      };
    });
  } catch (error) {
    console.error("⚠️ Error getting daily stats:", error.message);
    throw error;
  }
}

/**
 * Get user details
 */
async function getUserDetails(userId) {
  try {
    const db = getFirestoreDB();

    const userStatsDoc = await db
      .collection("analytics")
      .doc("userStats")
      .collection("users")
      .doc(userId)
      .get();

    if (!userStatsDoc.exists) {
      return null;
    }

    const userCalls = await db
      .collection("analytics")
      .doc("apiCalls")
      .collection("calls")
      .where("userId", "==", userId)
      .orderBy("timestamp", "desc")
      .limit(50)
      .get();

    const recentCalls = [];
    userCalls.forEach((doc) => {
      recentCalls.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    return {
      ...userStatsDoc.data(),
      recentCalls,
    };
  } catch (error) {
    console.error("⚠️ Error getting user details:", error.message);
    throw error;
  }
}

/**
 * Get detailed call information by ID
 */
async function getCallDetails(callId) {
  try {
    const db = getFirestoreDB();

    const callDoc = await db
      .collection("analytics")
      .doc("apiCalls")
      .collection("calls")
      .doc(callId)
      .get();

    if (!callDoc.exists) {
      return null;
    }

    return {
      id: callDoc.id,
      ...callDoc.data(),
    };
  } catch (error) {
    console.error("⚠️ Error getting call details:", error.message);
    throw error;
  }
}

/**
 * Get all activity with optional date filters
 */
async function getAllActivity(filters = {}) {
  try {
    const db = getFirestoreDB();
    const { startDate, endDate } = filters;

    let query = db
      .collection("analytics")
      .doc("apiCalls")
      .collection("calls")
      .orderBy("timestamp", "desc");

    // Apply date filters if provided
    if (startDate) {
      query = query.where("timestamp", ">=", startDate);
    }
    if (endDate) {
      query = query.where("timestamp", "<=", endDate);
    }

    const snapshot = await query.get();

    const allCalls = snapshot.docs.map((doc) => ({
      id: doc.id,
      endpoint: unsanitizeEndpointName(doc.data().endpoint || "Unknown"),
      userId: doc.data().userId || "Unknown",
      timestamp: doc.data().timestamp || Date.now(),
      responseTime: doc.data().responseTime || 0,
      costINR: doc.data().costBreakdown?.costs?.totalINR || 0,
      error: doc.data().error || false,
      statusCode: doc.data().statusCode || 200,
    }));

    console.log(
      `📊 Retrieved ${allCalls.length} calls${
        startDate || endDate ? " (filtered)" : " (all time)"
      }`
    );

    return allCalls;
  } catch (error) {
    console.error("⚠️ Error getting all activity:", error.message);
    throw error;
  }
}

module.exports = {
  estimateTokenCount,
  calculateCost,
  trackApiCall,
  getAnalyticsSummary,
  getDailyStats,
  getUserDetails,
  getCallDetails,
  getAllActivity,
  PRICING,
  USD_TO_INR,
};
