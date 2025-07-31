const express = require("express");
const cors = require("cors");
const { body, validationResult } = require('express-validator');

// Import security middleware
const {
  apiLimiter,
  submitLimiter,
  corsOptions,
  requireApiKey,
  validateRequest,
  securityHeaders,
  sanitizeInput,
  securityLogger,
} = require('./security');

const app = express();
const port = process.env.PORT || 8000;

// Apply security headers
app.use(securityHeaders);

// Security logging
app.use(securityLogger);

// CORS with security configuration
app.use(cors(corsOptions));

// Rate limiting for all API endpoints
app.use('/api', apiLimiter);

// Body parsing with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request validation and sanitization
app.use(validateRequest);
app.use(sanitizeInput);

// API endpoint to receive topic and syllabus (with enhanced security)
app.post("/api/submit", 
  submitLimiter, // Additional rate limiting for this endpoint
  requireApiKey, // Require API key
  [
    // Input validation
    body('topic')
      .isLength({ min: 1, max: 200 })
      .withMessage('Topic must be between 1 and 200 characters')
      .trim()
      .escape(),
    body('syllabus')
      .isLength({ min: 1, max: 10000 })
      .withMessage('Syllabus must be between 1 and 10000 characters')
      .trim()
  ],
  async (req, res) => {
    try {
      // Check validation results
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        });
      }

      const { topic, syllabus } = req.body;

      // Additional validation
      if (!topic || !syllabus) {
        return res.status(400).json({
          success: false,
          message: "Both topic and syllabus are required fields",
        });
      }

      // Process the data (you can add your logic here)
      console.log("Received data:");
      console.log("Topic:", topic);
      console.log("Syllabus:", syllabus);

      try {
        // Dynamic import for ES modules
        const { GetAiOutputGemini } = await import("./gemini_ai.mjs");
        const aiResponse = await GetAiOutputGemini(topic, syllabus);
        console.log("AI Response:", aiResponse);

        // Send success response with AI data
        res.json({
          success: true,
          message: "Data received and processed successfully",
          data: {
            topic,
            syllabus,
            aiResponse,
          },
        });
      } catch (aiError) {
        console.error("Error with AI processing:", aiError);
        // Send success response even if AI fails
        res.json({
          success: true,
          message: "Data received successfully (AI processing failed)",
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
  }
);

// Health check endpoint (with API key protection)
app.get("/api/health", requireApiKey, (req, res) => {
  res.json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Public health check (without API key for basic monitoring)
app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      message: 'CORS: Origin not allowed',
    });
  }
  
  res.status(500).json({
    success: false,
    message: 'Internal server error',
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
  });
});

// Start the server
app.listen(port, "0.0.0.0", () => {
  console.log(`Server is running on port ${port}`);
  console.log(`Health check: http://localhost:${port}/api/health`);
  console.log(`Submit endpoint: http://localhost:${port}/api/submit`);
  console.log(`Server accessible from network at: http://192.168.x.x:${port}`);
});
