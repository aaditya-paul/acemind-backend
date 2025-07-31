// Example usage of both Ollama and Gemini AI functions
import {GetAiOutput} from "./get_ai_output.mjs";
import {GetAiOutputGemini} from "./gemini_ai.mjs";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

async function testBothAIs() {
  const topic = "Mobile Computing";
  const syllabus = `
    UNIT 1: Introduction to Mobile Computing (10 hours)
    - Overview of mobile computing
    - Mobile computing architecture
    - Wireless communication basics
    
    UNIT 2: Mobile Communication Technologies (12 hours)
    - GSM, CDMA, LTE
    - Wireless protocols
    - Network architectures
    
    UNIT 3: Mobile Application Development (15 hours)
    - Android development
    - iOS development
    - Cross-platform frameworks
  `;

  try {
    console.log("🤖 Testing Ollama (llama3)...");
    const ollamaResult = await GetAiOutput(topic, syllabus);
    console.log("Ollama Result:", ollamaResult);

    console.log("\n" + "=".repeat(50) + "\n");

    console.log("🧠 Testing Gemini...");
    const geminiResult = await GetAiOutputGemini(topic, syllabus);
    console.log("Gemini Result:", geminiResult);
  } catch (error) {
    console.error("Error during testing:", error);
  }
}

// Uncomment the line below to test
// testBothAIs();

export {testBothAIs};
