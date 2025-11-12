// Analytics tracking and storage system
const fs = require("fs").promises;
const path = require("path");

const ANALYTICS_FILE = path.join(__dirname, "analytics-data.json");

// In-memory analytics cache
let analyticsCache = {
  apiCalls: [],
  userActivity: {},
  dailyStats: {},
  costTracking: {},
};

/**
 * Load analytics from file
 */
async function loadAnalytics() {
  try {
    const data = await fs.readFile(ANALYTICS_FILE, "utf8");
    const loadedData = JSON.parse(data);

    // Reconstruct Sets from arrays (JSON doesn't support Set)
    if (loadedData.dailyStats) {
      Object.keys(loadedData.dailyStats).forEach((date) => {
        if (loadedData.dailyStats[date].uniqueUsers) {
          loadedData.dailyStats[date].uniqueUsers = new Set(
            loadedData.dailyStats[date].uniqueUsers
          );
        }
      });
    }

    analyticsCache = loadedData;
    console.log("📊 Analytics data loaded from disk");
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log("📊 No existing analytics file, starting fresh");
      await saveAnalytics();
    } else {
      console.error("⚠️ Error loading analytics:", error.message);
    }
  }
}

/**
 * Save analytics to file
 */
async function saveAnalytics() {
  try {
    // Convert Sets to Arrays for JSON serialization
    const dataToSave = JSON.parse(
      JSON.stringify(analyticsCache, (key, value) => {
        if (value instanceof Set) {
          return Array.from(value);
        }
        return value;
      })
    );

    await fs.writeFile(
      ANALYTICS_FILE,
      JSON.stringify(dataToSave, null, 2),
      "utf8"
    );
  } catch (error) {
    console.error("⚠️ Error saving analytics:", error.message);
  }
}

/**
 * Track API call
 */
function trackApiCall(endpoint, userId, details = {}) {
  const timestamp = Date.now();
  const date = new Date(timestamp).toISOString().split("T")[0];

  // Add to API calls log (keep last 10,000)
  analyticsCache.apiCalls.push({
    endpoint,
    userId: userId || "anonymous",
    timestamp,
    date,
    ...details,
  });

  // Keep only last 10,000 calls to prevent memory issues
  if (analyticsCache.apiCalls.length > 10000) {
    analyticsCache.apiCalls = analyticsCache.apiCalls.slice(-10000);
  }

  // Update user activity
  if (userId) {
    if (!analyticsCache.userActivity[userId]) {
      analyticsCache.userActivity[userId] = {
        firstSeen: timestamp,
        lastSeen: timestamp,
        totalCalls: 0,
        endpoints: {},
      };
    }

    const userStats = analyticsCache.userActivity[userId];
    userStats.lastSeen = timestamp;
    userStats.totalCalls++;
    userStats.endpoints[endpoint] = (userStats.endpoints[endpoint] || 0) + 1;
  }

  // Update daily stats
  if (!analyticsCache.dailyStats[date]) {
    analyticsCache.dailyStats[date] = {
      totalCalls: 0,
      uniqueUsers: new Set(),
      endpoints: {},
    };
  }

  analyticsCache.dailyStats[date].totalCalls++;
  if (userId) {
    analyticsCache.dailyStats[date].uniqueUsers.add(userId);
  }
  analyticsCache.dailyStats[date].endpoints[endpoint] =
    (analyticsCache.dailyStats[date].endpoints[endpoint] || 0) + 1;

  // Track costs
  trackCost(endpoint, details);
}

/**
 * Track estimated costs per API call
 */
function trackCost(endpoint, details) {
  const costs = {
    "/api/submit": 0.00064,
    "/api/expand-subtopics": 0.0025, // Using Pro model
    "/api/notes": 0.00105,
    "/api/doubt-chat": 0.0, // Currently free (Flash Exp)
    "/api/generate-quiz": 0.0008,
    "/api/suggested-questions": 0.0, // Currently free
  };

  const cost = costs[endpoint] || 0;
  const date = new Date().toISOString().split("T")[0];

  if (!analyticsCache.costTracking[date]) {
    analyticsCache.costTracking[date] = {
      totalCost: 0,
      byCalls: {},
    };
  }

  analyticsCache.costTracking[date].totalCost += cost;
  analyticsCache.costTracking[date].byCalls[endpoint] =
    (analyticsCache.costTracking[date].byCalls[endpoint] || 0) + cost;
}

/**
 * Get analytics summary
 */
function getAnalyticsSummary() {
  const now = Date.now();
  const last24h = now - 24 * 60 * 60 * 1000;
  const last7d = now - 7 * 24 * 60 * 60 * 1000;
  const last30d = now - 30 * 24 * 60 * 60 * 1000;

  // Filter calls by time period
  const calls24h = analyticsCache.apiCalls.filter(
    (c) => c.timestamp >= last24h
  );
  const calls7d = analyticsCache.apiCalls.filter((c) => c.timestamp >= last7d);
  const calls30d = analyticsCache.apiCalls.filter(
    (c) => c.timestamp >= last30d
  );

  // Active users
  const activeUsers24h = new Set(
    calls24h.map((c) => c.userId).filter((id) => id !== "anonymous")
  );
  const activeUsers7d = new Set(
    calls7d.map((c) => c.userId).filter((id) => id !== "anonymous")
  );
  const activeUsers30d = new Set(
    calls30d.map((c) => c.userId).filter((id) => id !== "anonymous")
  );

  // Top endpoints
  const endpointCount = {};
  calls30d.forEach((call) => {
    endpointCount[call.endpoint] = (endpointCount[call.endpoint] || 0) + 1;
  });

  // Top users
  const userCallCount = {};
  calls30d.forEach((call) => {
    if (call.userId !== "anonymous") {
      userCallCount[call.userId] = (userCallCount[call.userId] || 0) + 1;
    }
  });

  const topUsers = Object.entries(userCallCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([userId, calls]) => ({
      userId,
      calls,
      lastSeen: analyticsCache.userActivity[userId]?.lastSeen,
    }));

  // Calculate costs
  const today = new Date().toISOString().split("T")[0];
  const costToday = analyticsCache.costTracking[today]?.totalCost || 0;

  const last30Days = [];
  for (let i = 0; i < 30; i++) {
    const date = new Date(now - i * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    last30Days.push(date);
  }

  const cost30d = last30Days.reduce(
    (sum, date) => sum + (analyticsCache.costTracking[date]?.totalCost || 0),
    0
  );

  // Hourly distribution (last 24h)
  const hourlyDistribution = new Array(24).fill(0);
  calls24h.forEach((call) => {
    const hour = new Date(call.timestamp).getHours();
    hourlyDistribution[hour]++;
  });

  return {
    overview: {
      totalApiCalls: analyticsCache.apiCalls.length,
      totalUsers: Object.keys(analyticsCache.userActivity).length,
      activeUsers24h: activeUsers24h.size,
      activeUsers7d: activeUsers7d.size,
      activeUsers30d: activeUsers30d.size,
    },
    calls: {
      last24h: calls24h.length,
      last7d: calls7d.length,
      last30d: calls30d.length,
    },
    costs: {
      today: costToday.toFixed(4),
      last30d: cost30d.toFixed(4),
      projected30d: (costToday * 30).toFixed(4),
    },
    topEndpoints: Object.entries(endpointCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([endpoint, count]) => ({ endpoint, count })),
    topUsers,
    hourlyDistribution,
    recentCalls: analyticsCache.apiCalls.slice(-100).reverse(),
  };
}

/**
 * Get daily stats for chart
 */
function getDailyStats(days = 30) {
  const result = [];
  const now = Date.now();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now - i * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const stats = analyticsCache.dailyStats[date];

    result.push({
      date,
      calls: stats?.totalCalls || 0,
      users: stats?.uniqueUsers ? stats.uniqueUsers.size : 0,
      cost: analyticsCache.costTracking[date]?.totalCost || 0,
    });
  }

  return result;
}

/**
 * Get user details
 */
function getUserDetails(userId) {
  const userActivity = analyticsCache.userActivity[userId];
  if (!userActivity) return null;

  const userCalls = analyticsCache.apiCalls.filter((c) => c.userId === userId);

  return {
    userId,
    firstSeen: userActivity.firstSeen,
    lastSeen: userActivity.lastSeen,
    totalCalls: userActivity.totalCalls,
    endpoints: userActivity.endpoints,
    recentCalls: userCalls.slice(-50).reverse(),
  };
}

// Auto-save analytics every 60 seconds
setInterval(() => {
  if (analyticsCache.apiCalls.length > 0) {
    saveAnalytics();
  }
}, 60000);

module.exports = {
  loadAnalytics,
  saveAnalytics,
  trackApiCall,
  getAnalyticsSummary,
  getDailyStats,
  getUserDetails,
};
