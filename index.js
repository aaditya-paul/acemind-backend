const express = require("express");
const cors = require("cors");
// Use dynamic import for ES modules
const app = express();
const port = process.env.PORT || 8000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({extended: true}));

// API endpoint to receive topic and syllabus
app.post("/api/submit", async (req, res) => {
  try {
    const {topic, syllabus} = req.body;

    // Validate required fields
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
      const {GetAiOutputGemini} = await import("./gemini_ai.mjs");
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
});

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
  console.log(`Submit endpoint: http://localhost:${port}/api/submit`);
  console.log(`Server accessible from network at: http://192.168.x.x:${port}`);
});
