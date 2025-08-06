const express = require("express");
const cors = require("cors");
// Use dynamic import for ES modules
const app = express();
const port = process.env.PORT || 8000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({extended: true}));

app.post("/api/notes", async (req, res) => {
  const {topic, subtopic, syllabus, aiProvider = "gemini"} = req.body;
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

    // Process the data (you can add your logic here)
    console.log("Received data:");
    console.log("Syllabus:", syllabus);
    console.log("Topic:", topic);
    console.log("Subtopic:", subtopic);
    console.log("AI Provider:", aiProvider);

    try {
      let aiResponse;
      if (aiProvider.toLowerCase() === "gemini") {
        // Use Gemini AI
        const {GetNotesGemini} = await import("./get_notes_gemini.mjs");
        aiResponse = await GetNotesGemini(topic, syllabus, subtopic);
        console.log("Gemini AI Response:", aiResponse);
      } else {
        // Use Ollama (default)
        const {GetNotesOllama} = await import("./get_notes_ollama.mjs");
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
    const {topic, syllabus, aiProvider = "gemini"} = req.body;

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
        const {GetAiOutputGemini} = await import("./gemini_ai.mjs");
        const {GetSyllabusContext} = await import("./getSyllabusContext.mjs");
        aiResponse = await GetAiOutputGemini(topic, syllabus);
        SyllabusContext = await GetSyllabusContext(topic, syllabus);

        console.log("Gemini AI Response:", aiResponse);
      } else {
        // Use Ollama (default)
        const {GetAiOutput} = await import("./get_ai_output.mjs");
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
      // Send success response even if AI fails
      res.json({
        success: true,
        message: `Data received successfully (${aiProvider} AI processing failed)`,
        data: {
          topic,
          syllabus,
          aiProvider,
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

// Original endpoint for backward compatibility
app.post("/api/submit-ollama", async (req, res) => {
  try {
    const {topic, syllabus} = req.body;

    if (!topic || !syllabus) {
      return res.status(400).json({
        success: false,
        message: "Both topic and syllabus are required fields",
      });
    }

    try {
      const {GetAiOutput} = await import("./get_ai_output.mjs");
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
    const {topic, syllabus} = req.body;

    if (!topic || !syllabus) {
      return res.status(400).json({
        success: false,
        message: "Both topic and syllabus are required fields",
      });
    }

    try {
      const {GetAiOutputGemini} = await import("./gemini_ai.mjs");
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
  console.log(`Submit endpoint (flexible): http://localhost:${port}/api/notes`);
  console.log(
    `Submit endpoint (Ollama): http://localhost:${port}/api/submit-ollama`
  );
  console.log(
    `Submit endpoint (Gemini): http://localhost:${port}/api/submit-gemini`
  );
  console.log(`Server accessible from network at: http://192.168.x.x:${port}`);
});
