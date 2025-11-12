import { GoogleGenAI } from "@google/genai";
import { SyllabusSchema } from "./ai_outpt_schema.mjs";
import dotenv from "dotenv";

dotenv.config();

// 🛠 Clean common Gemini formatting mistakes
function sanitizeJson(jsonString) {
  return jsonString
    .replace(/,\s*}/g, "}") // remove trailing commas in objects
    .replace(/,\s*]/g, "]") // remove trailing commas in arrays
    .replace(/(\d+)\s*(hours?|mins?|minutes?)/gi, '"$1 $2"') // wrap durations
    .replace(/\\n/g, "") // remove escaped newlines
    .trim();
}

// 🔧 Adapt raw AI response to match your schema
function adaptAIResponse(output) {
  return {
    courseTitle: output.course_title,
    description: output.course_description,
    objectives: output.course_objectives,
    units: output.units.map((u) => ({
      unit_num: String(u.unit_num),
      title: u.title,
      duration: Number(u.duration),
      sub_topics: u.sub_topics,
    })),
  };
}

// 🎯 Main Function
export async function GetAiOutputGemini(topic, syllabus) {
  const genAI = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || "YOUR_BACKUP_API_KEY_HERE",
  });

  const prompt = `
You are an AI assistant that converts syllabus into structured JSON.

Use these exact keys:
- course_title (string)
- course_description (string)
- course_objectives (array of strings)
- units (array of objects with keys: unit_num (number), title, duration (number), sub_topics (array))

the subtopic should be short, a summarized version of the subtopic but it should be clear and concise if possible keep it to one or two words but keep the specifics.

Wrap the result inside \`\`\`json code block.

Topic: ${topic}
Syllabus: ${syllabus}
`;

  try {
    console.log("⚙️ Asking Gemini...");
    const response = await genAI.models.generateContent({
      model: "gemini-2.0-flash", // Balanced accuracy for syllabus parsing
      contents: [{ role: "user", text: prompt }],
    });

    const text = response.text;
    console.log("🧠 Raw Gemini Response:\n", text);

    const match = text.match(/```json([\s\S]*?)```/);
    if (!match) throw new Error("❌ No valid ```json block found.");

    const rawJsonString = sanitizeJson(match[1]);
    console.log("📦 Cleaned JSON string:\n", rawJsonString);

    const rawOutput = JSON.parse(rawJsonString);

    const adapted = adaptAIResponse(rawOutput);
    const validated = SyllabusSchema.parse(adapted);

    console.log("✅ Final Validated Output:\n", validated);
    return validated;
  } catch (err) {
    console.error("❌ Error:", err.message);
    return null;
  }
}
