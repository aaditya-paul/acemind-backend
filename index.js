// Load environment variables FIRST (before any other imports that use them)
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs").promises;
const path = require("path");
const {
  sanitizeQuestionsForClient,
  generateQuizHash,
  validateQuizSubmission,
  calculateScore,
  generateSessionId,
} = require("./quizSecurity");

// NEW: Firebase-based analytics with token counting
const { initializeFirebaseAdmin } = require("./firebaseAdmin");
const {
  getAnalyticsSummary,
  getDailyStats,
  getUserDetails,
} = require("./analyticsDB");
const { analyticsMiddleware } = require("./analyticsMiddleware");

// NEW: Firebase-based quiz session storage
const {
  storeQuizSession,
  getQuizSession,
  deleteQuizSession,
} = require("./quizSessionManager");

// Initialize Firebase Admin SDK
initializeFirebaseAdmin();

// Use dynamic import for ES modules
const app = express();
const port = process.env.PORT || 8000;

// Admin password (change this in production!)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

console.log(
  "� Quiz sessions now stored in Firebase - no server restart needed!"
);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// NEW: Analytics middleware with token counting and cost calculation
app.use(analyticsMiddleware());

app.post("/api/expand-subtopics", async (req, res) => {
  const {
    subtopic,
    syllabus,
    topic,
    unitTitle,
    count = 4,
    level = 1,
    parentContext = null,
    hierarchyPath = [],
  } = req.body;

  try {
    // Validate required fields
    if (!subtopic || !syllabus || !topic || !unitTitle) {
      return res.status(400).json({
        success: false,
        message: "subtopic, syllabus, topic, and unitTitle are required fields",
      });
    }

    console.log(`🚀 API: Expanding Level ${level} subtopic: "${subtopic}"`);
    console.log(`📍 Hierarchy Path: ${hierarchyPath.join(" > ")}`);
    console.log(`👤 Parent Context: ${parentContext || "None"}`);

    // Import the function dynamically
    const { GetExpandedSubtopics } = await import("./getExpandedSubtopics.mjs");

    // Create enhanced context for AI to understand hierarchy
    let enhancedSubtopic = subtopic;
    let contextualDescription = "";

    if (parentContext && level > 1) {
      enhancedSubtopic = `${parentContext} > ${subtopic}`;
      contextualDescription = `This is a level ${level} expansion of "${subtopic}" within the context of "${parentContext}".`;
    } else {
      contextualDescription = `This is a level ${level} expansion of the main subtopic "${subtopic}".`;
    }

    // Add level context for better AI understanding
    const contextualPrompt =
      level > 1
        ? `${contextualDescription} Generate ${count} more specific sub-topics for: "${enhancedSubtopic}"`
        : subtopic;

    const expandedSubtopics = await GetExpandedSubtopics(
      contextualPrompt,
      syllabus,
      topic,
      unitTitle,
      count,
      level, // Pass level to AI for context
      parentContext // Pass parent context
    );

    // Transform the response with enhanced metadata
    const responseData = {
      subtopics: expandedSubtopics,
      metadata: {
        level: level,
        parentContext: parentContext,
        hierarchyPath: hierarchyPath,
        originalSubtopic: subtopic,
        enhancedSubtopic: enhancedSubtopic,
        canExpandFurther: level < 10, // Reasonable depth limit
        totalGenerated: expandedSubtopics.length,
        generatedAt: new Date().toISOString(),
        apiVersion: "2.0",
      },
    };

    console.log(
      `✅ API: Successfully generated ${expandedSubtopics.length} level-${level} subtopics`
    );

    // Send success response
    res.json({
      success: true,
      message: `Level ${level} expanded subtopics generated successfully for "${subtopic}"`,
      data: responseData,
      subtopics: expandedSubtopics, // For backward compatibility
    });
  } catch (error) {
    console.error(
      `❌ API Error in /api/expand-subtopics (Level ${level}):`,
      error
    );
    return res.status(500).json({
      success: false,
      message: "Internal server error while generating expanded subtopics",
      error: error.message,
      level: level,
      subtopic: subtopic,
    });
  }
});

// New endpoint for expanding a specific subtopic node
app.post("/api/expand-subtopic-node", async (req, res) => {
  const {
    subtopicId,
    subtopicTitle,
    parentSubtopic,
    syllabus,
    topic,
    unitTitle,
    level = 1,
    count = 4,
  } = req.body;

  try {
    // Validate required fields
    if (!subtopicTitle || !syllabus || !topic || !unitTitle) {
      return res.status(400).json({
        success: false,
        message:
          "subtopicTitle, syllabus, topic, and unitTitle are required fields",
      });
    }

    // Import the function dynamically
    const { GetExpandedSubtopics } = await import("./getExpandedSubtopics.mjs");
    const expandedSubtopics = await GetExpandedSubtopics(
      subtopicTitle,
      syllabus,
      topic,
      unitTitle,
      count
    );

    // Transform the flat array into nested structure for this specific subtopic
    const nestedSubtopics = expandedSubtopics.map((childSubtopic, index) => ({
      id: `${subtopicId || subtopicTitle}-child-${index + 1}`,
      title: childSubtopic,
      children: [],
      hasChildren: level < 3, // Limit expansion to 3 levels to prevent infinite nesting
      level: level + 1,
      parentId: subtopicId || subtopicTitle,
    }));

    // Send success response with children for this specific node
    res.json({
      success: true,
      message: "Subtopic expanded successfully",
      data: {
        parentId: subtopicId || subtopicTitle,
        parentTitle: subtopicTitle,
        children: nestedSubtopics,
        level: level,
      },
    });
  } catch (error) {
    console.error("Error in /api/expand-subtopic-node:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// Comprehensive endpoint for managing subtopic tree structure
app.post("/api/subtopic-tree", async (req, res) => {
  const {
    action, // "expand" or "get_children"
    subtopic,
    syllabus,
    topic,
    unitTitle,
    parentPath = [], // Array of parent subtopics for context
    level = 0,
    maxLevel = 3,
    count = 4,
  } = req.body;

  try {
    // Validate required fields
    if (!subtopic || !syllabus || !topic || !unitTitle || !action) {
      return res.status(400).json({
        success: false,
        message:
          "subtopic, syllabus, topic, unitTitle, and action are required fields",
      });
    }

    if (!["expand", "get_children"].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "action must be either 'expand' or 'get_children'",
      });
    }

    // Import the function dynamically
    const { GetExpandedSubtopics } = await import("./getExpandedSubtopics.mjs");

    // Build context for better AI understanding of the subtopic hierarchy
    const contextualSubtopic =
      parentPath.length > 0
        ? `${parentPath.join(" -> ")} -> ${subtopic}`
        : subtopic;

    const expandedSubtopics = await GetExpandedSubtopics(
      contextualSubtopic,
      syllabus,
      topic,
      unitTitle,
      count
    );

    // Create the tree node structure
    const createTreeNode = (title, index, currentLevel) => ({
      id: `${parentPath.join("-")}-${subtopic}-${index + 1}`.replace(/^-/, ""),
      title: title,
      children: [],
      isExpanded: false,
      hasChildren: currentLevel < maxLevel,
      level: currentLevel + 1,
      parentPath: [...parentPath, subtopic],
      canExpand: currentLevel < maxLevel,
    });

    const treeNodes = expandedSubtopics.map((title, index) =>
      createTreeNode(title, index, level)
    );

    // Response structure
    const response = {
      success: true,
      message: `Subtopic tree ${action} successful`,
      data: {
        action: action,
        parent: {
          id:
            parentPath.length > 0
              ? `${parentPath.join("-")}-${subtopic}`
              : subtopic,
          title: subtopic,
          level: level,
          path: [...parentPath, subtopic],
        },
        children: treeNodes,
        metadata: {
          level: level,
          maxLevel: maxLevel,
          canExpandFurther: level < maxLevel,
          totalChildren: treeNodes.length,
          parentPath: parentPath,
        },
      },
    };

    res.json(response);
  } catch (error) {
    console.error("Error in /api/subtopic-tree:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

app.post("/api/notes", async (req, res) => {
  const {
    topic,
    subtopic,
    syllabus,
    aiProvider = "gemini",
    level = 1,
    hierarchyPath = [],
    parentContext = null,
  } = req.body;

  try {
    // Validate required fields
    if (!topic || !syllabus) {
      return res.status(400).json({
        success: false,
        message: "Both topic and syllabus are required fields",
      });
    }

    // Validate AI provider
    if (!["ollama", "gemini"].includes(aiProvider.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: "AI provider must be either 'ollama' or 'gemini'",
      });
    }

    console.log(
      `📚 API: Generating notes for Level ${level} subtopic: "${subtopic}"`
    );
    console.log(`📍 Hierarchy Path: ${hierarchyPath.join(" > ")}`);
    console.log(`👤 Parent Context: ${parentContext || "None"}`);
    console.log(`🤖 AI Provider: ${aiProvider}`);

    try {
      let aiResponse;
      if (aiProvider.toLowerCase() === "gemini") {
        // Use Gemini AI with hierarchical context
        const { GetNotesGemini } = await import("./get_notes_gemini.mjs");

        // Create context-aware subtopic for better AI understanding
        let contextualSubtopic = subtopic || "General Overview";
        let contextualDescription = "";

        if (parentContext && level > 1) {
          contextualSubtopic = `${parentContext} > ${subtopic}`;
          contextualDescription = `This content is for level ${level} subtopic "${subtopic}" within the broader context of "${parentContext}". Provide detailed, specific information that builds upon the parent topic.`;
        } else {
          contextualDescription = `This content is for the main subtopic "${subtopic}". Provide comprehensive foundational information.`;
        }

        // Add hierarchy metadata to the request
        const enhancedSubtopic =
          level > 1
            ? `Level ${level}: ${contextualSubtopic}`
            : contextualSubtopic;

        aiResponse = await GetNotesGemini(topic, syllabus, enhancedSubtopic);
        console.log(
          `✅ Gemini AI Response generated for level ${level}:`,
          aiResponse
        );

        // Add metadata to response
        aiResponse = {
          ...aiResponse,
          metadata: {
            level: level,
            hierarchyPath: hierarchyPath,
            parentContext: parentContext,
            originalSubtopic: subtopic,
            enhancedSubtopic: enhancedSubtopic,
            generatedAt: new Date().toISOString(),
            contentDepth:
              level === 1 ? "broad" : level === 2 ? "detailed" : "deep",
            apiVersion: "2.0",
          },
        };
      } else {
        // Use Ollama (default) - basic implementation for now
        const { GetNotesOllama } = await import("./get_notes_ollama.mjs");
        aiResponse = await GetNotesOllama(topic, syllabus);
        if (!aiResponse.success) {
          console.log("failed ");

          return res.status(500).json({
            success: false,
            message: "Failed to fetch notes from Ollama AI",
            error: aiResponse.error,
          });
        }
        console.log("Ollama AI Response:", aiResponse);
      }

      // Send success response with AI data
      res.json({
        success: true,
        message: `Data received and processed successfully using ${aiProvider}`,
        data: {
          topic,
          syllabus,
          aiProvider,
          aiResponse,
        },
      });
    } catch (aiError) {
      console.error(`Error with ${aiProvider} AI processing:`, aiError);
      // Send error response when AI fails
      return res.status(500).json({
        success: false,
        message: `Failed to process request with ${aiProvider} AI`,
        error: aiError.message,
      });
    }
  } catch (error) {
    console.error("Error processing request:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});
// API endpoint to receive topic and syllabus with AI provider selection
app.post("/api/submit", async (req, res) => {
  try {
    const { topic, syllabus, aiProvider = "gemini" } = req.body;

    // Validate required fields
    if (!topic || !syllabus) {
      return res.status(400).json({
        success: false,
        message: "Both topic and syllabus are required fields",
      });
    }

    // Validate AI provider
    if (!["ollama", "gemini"].includes(aiProvider.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: "AI provider must be either 'ollama' or 'gemini'",
      });
    }

    // Process the data (you can add your logic here)
    console.log("Received data:");
    console.log("Topic:", topic);
    console.log("Syllabus:", syllabus);
    console.log("AI Provider:", aiProvider);

    try {
      let aiResponse;
      let SyllabusContext;
      if (aiProvider.toLowerCase() === "gemini") {
        // Use Gemini AI
        const { GetAiOutputGemini } = await import("./gemini_ai.mjs");
        const { GetSyllabusContext } = await import("./getSyllabusContext.mjs");
        aiResponse = await GetAiOutputGemini(topic, syllabus);
        SyllabusContext = await GetSyllabusContext(topic, syllabus);

        console.log("Gemini AI Response:", aiResponse);
      } else {
        // Use Ollama (default)
        const { GetAiOutput } = await import("./get_ai_output.mjs");
        aiResponse = await GetAiOutput(topic, syllabus);
        console.log("Ollama AI Response:", aiResponse);
      }

      // Send success response with AI data
      res.json({
        success: true,
        message: `Data received and processed successfully using ${aiProvider}`,
        data: {
          topic,
          syllabus,
          aiProvider,
          aiResponse,
          syllabusContext: SyllabusContext ? SyllabusContext.text : null,
        },
      });
    } catch (aiError) {
      console.error(`Error with ${aiProvider} AI processing:`, aiError);

      // Determine appropriate status code based on error
      const statusCode =
        aiError.status === 503
          ? 503
          : aiError.status === 429
          ? 429
          : aiError.status >= 400
          ? aiError.status
          : 500;

      // Return proper error response so analytics tracks it as failed call
      res.status(statusCode).json({
        success: false,
        message:
          aiError.status === 503
            ? "AI service temporarily unavailable. Please try again in a few moments."
            : aiError.status === 429
            ? "Rate limit exceeded. Please try again later."
            : `AI processing failed: ${aiError.message}`,
        error: {
          type: "AI_SERVICE_ERROR",
          details: aiError.message,
          status: aiError.status || "unknown",
        },
      });
    }
  } catch (error) {
    console.error("Error processing request:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Original endpoint for backward compatibility
app.post("/api/submit-ollama", async (req, res) => {
  try {
    const { topic, syllabus } = req.body;

    if (!topic || !syllabus) {
      return res.status(400).json({
        success: false,
        message: "Both topic and syllabus are required fields",
      });
    }

    try {
      const { GetAiOutput } = await import("./get_ai_output.mjs");
      const aiResponse = await GetAiOutput(topic, syllabus);

      res.json({
        success: true,
        message: "Data received and processed successfully with Ollama",
        data: {
          topic,
          syllabus,
          aiResponse,
        },
      });
    } catch (aiError) {
      console.error("Error with Ollama AI processing:", aiError);
      res.json({
        success: true,
        message: "Data received successfully (Ollama AI processing failed)",
        data: {
          topic,
          syllabus,
        },
      });
    }
  } catch (error) {
    console.error("Error processing request:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Gemini-specific endpoint
app.post("/api/submit-gemini", async (req, res) => {
  try {
    const { topic, syllabus } = req.body;

    if (!topic || !syllabus) {
      return res.status(400).json({
        success: false,
        message: "Both topic and syllabus are required fields",
      });
    }

    try {
      const { GetAiOutputGemini } = await import("./gemini_ai.mjs");
      const aiResponse = await GetAiOutputGemini(topic, syllabus);

      res.json({
        success: true,
        message: "Data received and processed successfully with Gemini",
        data: {
          topic,
          syllabus,
          aiResponse,
        },
      });
    } catch (aiError) {
      console.error("Error with Gemini AI processing:", aiError);
      res.json({
        success: true,
        message: "Data received successfully (Gemini AI processing failed)",
        data: {
          topic,
          syllabus,
          error: aiError.message,
        },
      });
    }
  } catch (error) {
    console.error("Error processing request:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Doubt Chat endpoint - AI tutor for student questions
app.post("/api/doubt-chat", async (req, res) => {
  const {
    question,
    context = null,
    selectedText = null,
    conversationHistory = [],
  } = req.body;

  try {
    // Validate required fields - only question is required
    if (!question) {
      return res.status(400).json({
        success: false,
        message: "Question is required",
      });
    }

    console.log("💬 Doubt Chat Request:");
    console.log("❓ Question:", question);
    console.log("📚 Has Context:", context ? "Yes" : "No (General mode)");
    console.log("📌 Selected Text:", selectedText ? "Yes" : "No");
    console.log("💭 History Length:", conversationHistory.length);

    // Import the AI function
    const { ProcessDoubtWithGemini } = await import("./doubt_chat_ai.mjs");

    // Provide default context if none provided
    const effectiveContext =
      context ||
      "# General Learning Context\nThe student is currently learning and may have general questions about their course material.\n";

    // Get AI response
    const answer = await ProcessDoubtWithGemini(
      question,
      effectiveContext,
      selectedText,
      conversationHistory
    );

    console.log("✅ Doubt answered successfully");

    // Send success response
    res.json({
      success: true,
      message: "Doubt processed successfully",
      answer: answer,
      hasContext: !!context,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Error in /api/doubt-chat:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to process doubt",
      error: error.message,
    });
  }
});

// Suggested Questions endpoint - Generate helpful questions
app.post("/api/suggested-questions", async (req, res) => {
  const { topic, context } = req.body;

  try {
    if (!topic || !context) {
      return res.status(400).json({
        success: false,
        message: "Both topic and context are required",
      });
    }

    const { GenerateSuggestedQuestions } = await import("./doubt_chat_ai.mjs");
    const questions = await GenerateSuggestedQuestions(topic, context);

    res.json({
      success: true,
      questions: questions,
    });
  } catch (error) {
    console.error("❌ Error generating suggested questions:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate questions",
      error: error.message,
    });
  }
});

// Generate Quiz Questions endpoint
app.post("/api/generate-quiz", async (req, res) => {
  const { topic, difficulty, questionCount, courseContext } = req.body;

  try {
    // Validate required fields
    if (!topic || typeof topic !== "string" || topic.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Valid topic is required (non-empty string)",
      });
    }

    if (
      !difficulty ||
      !["beginner", "intermediate", "advanced", "expert"].includes(difficulty)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Valid difficulty required (beginner, intermediate, advanced, expert)",
      });
    }

    if (!questionCount || questionCount < 1 || questionCount > 50) {
      return res.status(400).json({
        success: false,
        message: "questionCount must be between 1 and 50",
      });
    }

    console.log(
      `🎯 Generating ${questionCount} ${difficulty} quiz questions for: ${topic.substring(
        0,
        100
      )}...`
    );

    const { GenerateQuizQuestions } = await import("./generate_quiz_ai.mjs");

    const questions = await GenerateQuizQuestions(
      topic.trim(),
      difficulty,
      questionCount,
      courseContext || ""
    );

    if (!questions || questions.length === 0) {
      throw new Error("AI generated no questions");
    }

    console.log(`✅ Successfully generated ${questions.length} quiz questions`);

    // Generate secure session
    const sessionId = generateSessionId(
      req.body.userId || "anonymous",
      `${topic}-${Date.now()}`
    );
    const startTime = Date.now();
    const timeLimit = req.body.timeLimit || 600; // Default 10 minutes in seconds
    const sessionHash = generateQuizHash(sessionId, startTime, timeLimit);

    // Store full questions with answers in Firebase
    await storeQuizSession(
      sessionId,
      {
        questions, // Full questions with correct answers
        userId: req.body.userId || "anonymous",
        startTime,
        timeLimit,
        sessionHash,
        topic: topic.substring(0, 100),
        difficulty,
      },
      Math.ceil((timeLimit + 300) / 60) // Expires 5 min after time limit (in minutes)
    );

    // Send sanitized questions (without correct answers) to client
    const sanitizedQuestions = sanitizeQuestionsForClient(questions);

    res.json({
      success: true,
      sessionId,
      sessionHash,
      startTime,
      timeLimit,
      questions: sanitizedQuestions,
      metadata: {
        topic: topic.substring(0, 100),
        difficulty,
        questionCount: questions.length,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("❌ Error generating quiz questions:", error);

    // More specific error messages
    let statusCode = 500;
    let errorMessage = "Failed to generate quiz questions";

    if (error.message?.includes("API key")) {
      errorMessage = "Gemini API key configuration error";
    } else if (
      error.message?.includes("quota") ||
      error.message?.includes("rate limit")
    ) {
      errorMessage = "API quota exceeded, please try again later";
      statusCode = 429;
    } else if (
      error.message?.includes("parse") ||
      error.message?.includes("JSON")
    ) {
      errorMessage = "Failed to parse AI response";
    }

    return res.status(statusCode).json({
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// Secure quiz submission endpoint
app.post("/api/submit-quiz", async (req, res) => {
  try {
    const { sessionId, sessionHash, userAnswers, submitTime, userId } =
      req.body;

    // Validate required fields
    if (!sessionId || !sessionHash || !userAnswers || !submitTime) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    // Retrieve quiz session from Firebase
    const session = await getQuizSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Quiz session not found or expired",
      });
    }

    // Extract correct answers from stored questions
    const correctAnswers = session.questions.map((q) => q.correctAnswer);

    // Validate submission
    const validation = validateQuizSubmission({
      quizId: sessionId,
      startTime: session.startTime,
      submitTime,
      timeLimit: session.timeLimit,
      sessionHash,
      userAnswers,
      correctAnswers,
    });

    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid quiz submission",
        errors: validation.errors,
      });
    }

    // Calculate score server-side
    const scoreDetails = calculateScore(userAnswers, correctAnswers);

    // Build detailed results with questions and explanations
    const detailedMistakes = scoreDetails.mistakes.map((mistake) => {
      const question = session.questions[mistake.questionIndex];
      return {
        questionIndex: mistake.questionIndex,
        question: question.question,
        userAnswer:
          mistake.userAnswer !== null
            ? question.options[mistake.userAnswer]
            : "Not answered",
        correctAnswer: question.options[mistake.correctAnswer],
        explanation: question.explanation || "",
        options: question.options,
      };
    });

    const results = {
      ...scoreDetails,
      timeTaken: validation.actualTimeTaken,
      timeLimit: session.timeLimit,
      topic: session.topic,
      difficulty: session.difficulty,
      detailedMistakes,
      submittedAt: new Date(submitTime).toISOString(),
    };

    // Clean up session after successful submission
    await deleteQuizSession(sessionId);

    res.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error("❌ Error submitting quiz:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to submit quiz",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// ============================================================================
// ADMIN ANALYTICS ENDPOINTS
// ============================================================================

// Middleware to check admin password
function requireAdminAuth(req, res, next) {
  const password = req.headers["x-admin-password"] || req.query.password;

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized - Invalid admin password",
    });
  }

  next();
}

// Admin dashboard - main analytics (UPDATED: Firestore)
app.get("/api/admin/analytics", requireAdminAuth, async (req, res) => {
  try {
    const summary = await getAnalyticsSummary();
    res.json({
      success: true,
      data: summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Error fetching analytics:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch analytics",
      error: error.message,
    });
  }
});

// Daily stats for charts (UPDATED: Firestore)
app.get("/api/admin/daily-stats", requireAdminAuth, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const stats = await getDailyStats(days);

    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Error fetching daily stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch daily stats",
      error: error.message,
    });
  }
});

// Call details - get detailed information about a specific API call
app.get("/api/admin/call/:callId", requireAdminAuth, async (req, res) => {
  try {
    const callId = req.params.callId;
    const { getCallDetails } = require("./analyticsDB");
    const callDetails = await getCallDetails(callId);

    if (!callDetails) {
      return res.status(404).json({
        success: false,
        message: "Call not found",
      });
    }

    res.json({
      success: true,
      data: callDetails,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Error fetching call details:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch call details",
      error: error.message,
    });
  }
});

// All activity with date filters and pagination (NEW)
app.get("/api/admin/all-activity", requireAdminAuth, async (req, res) => {
  try {
    const { getAllActivity } = require("./analyticsDB");
    const { startDate, endDate } = req.query;

    const filters = {};
    const now = Date.now();

    if (startDate) {
      const start = parseInt(startDate);
      // Server-side validation: reject future dates
      if (start > now) {
        return res.status(400).json({
          success: false,
          message: "Start date cannot be in the future",
        });
      }
      filters.startDate = start;
    }

    if (endDate) {
      const end = parseInt(endDate);
      // Server-side validation: reject future dates
      if (end > now) {
        return res.status(400).json({
          success: false,
          message: "End date cannot be in the future",
        });
      }
      filters.endDate = end;
    }

    // Validate that start date is not after end date
    if (
      filters.startDate &&
      filters.endDate &&
      filters.startDate > filters.endDate
    ) {
      return res.status(400).json({
        success: false,
        message: "Start date cannot be after end date",
      });
    }

    const allActivity = await getAllActivity(filters);

    res.json({
      success: true,
      data: allActivity,
      count: allActivity.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Error fetching all activity:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch activity",
      error: error.message,
    });
  }
});

// User details (UPDATED: Firestore)
app.get("/api/admin/user/:userId", requireAdminAuth, async (req, res) => {
  try {
    const userId = req.params.userId;
    const userDetails = await getUserDetails(userId);

    if (!userDetails) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      data: userDetails,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Error fetching user details:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user details",
      error: error.message,
    });
  }
});

// ============================================================================

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
  });
});

// Start the server
app.listen(port, "0.0.0.0", () => {
  console.log(`Server is running on port ${port}`);
  console.log(`Health check: http://localhost:${port}/api/health`);
  console.log(
    `Submit endpoint (flexible): http://localhost:${port}/api/submit`
  );
  console.log(`Notes endpoint: http://localhost:${port}/api/notes`);
  console.log(`Doubt Chat endpoint: http://localhost:${port}/api/doubt-chat`);
  console.log(
    `Suggested Questions endpoint: http://localhost:${port}/api/suggested-questions`
  );
  console.log(`Generate Quiz: http://localhost:${port}/api/generate-quiz`);
  console.log(
    `Expand subtopics: http://localhost:${port}/api/expand-subtopics`
  );
  console.log(
    `Expand subtopic node: http://localhost:${port}/api/expand-subtopic-node`
  );
  console.log(
    `Subtopic tree management: http://localhost:${port}/api/subtopic-tree`
  );
  console.log(
    `Submit endpoint (Ollama): http://localhost:${port}/api/submit-ollama`
  );
  console.log(
    `Submit endpoint (Gemini): http://localhost:${port}/api/submit-gemini`
  );
  console.log(`Server accessible from network at: http://192.168.x.x:${port}`);
  console.log(
    `\n📊 ADMIN ANALYTICS: http://localhost:${port}/api/admin/analytics`
  );
  console.log(`   Password: ${ADMIN_PASSWORD}`);
  console.log(`   Frontend: http://localhost:3000/admin/analytics\n`);
});
