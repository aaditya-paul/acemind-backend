// import {GoogleGenerativeAI} from "@google/generative-ai";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { z } from "zod"; // Import Zod

dotenv.config();

// Conceptual schema for the notes output, used by Gemini's responseSchema.
// This guides the AI to produce the desired JSON structure.
const NotesSchema = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    content: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          heading: {
            type: "STRING",
            nullable: true, // Optional heading for each content item
          },
          type: {
            type: "STRING",
            enum: [
              "text",
              "bullet",
              "table",
              "code",
              "youtube",
              "image",
              "practiceQuestions",
            ],
          },
          value: { type: "STRING", nullable: true }, // For text and code content
          items: {
            type: "ARRAY",
            items: { type: "STRING" },
            nullable: true,
          }, // For bullet points and practice questions
          headers: {
            type: "ARRAY",
            items: { type: "STRING" },
            nullable: true,
          }, // For table headers
          rows: {
            type: "ARRAY",
            items: {
              type: "ARRAY",
              items: { type: "STRING" },
            },
            nullable: true,
          }, // For table rows
          language: { type: "STRING", nullable: true }, // For code
          videoTitle: { type: "STRING", nullable: true }, // For youtube
          url: { type: "STRING", nullable: true }, // For youtube and image
          description: { type: "STRING", nullable: true }, // For image
        },
        required: ["type"],
      },
    },
  },
  required: ["title", "content"],
};

// Zod schema for client-side validation of the notes output.
// This ensures the data conforms to the expected structure after parsing.
const ZodNotesSchema = z.object({
  title: z.string(),
  content: z.array(
    z.object({
      heading: z.string().nullable().optional(), // Optional heading for content sections
      type: z.enum([
        "text",
        "bullet",
        "table",
        "code",
        "youtube",
        "image",
        "practiceQuestions",
      ]),
      value: z.string().nullable().optional(), // For text and code content
      items: z.array(z.string()).nullable().optional(), // For bullet points and practice questions
      headers: z.array(z.string()).nullable().optional(), // For table headers
      rows: z.array(z.array(z.string())).nullable().optional(), // For table rows
      language: z.string().nullable().optional(), // For code
      videoTitle: z.string().nullable().optional(), // For youtube
      url: z.string().nullable().optional(), // For youtube and image
      description: z.string().nullable().optional(), // For image
    })
  ),
});

// 🛠 Clean common Gemini formatting mistakes and ensure proper JSON structure
function sanitizeJson(jsonString) {
  // This function is less critical when using responseSchema, as Gemini aims for valid JSON.
  // However, it can still catch edge cases or malformed characters.
  return jsonString
    .replace(/,\s*}/g, "}") // Remove trailing commas in objects
    .replace(/,\s*]/g, "]") // Remove trailing commas in arrays
    .replace(/\\n/g, "") // Remove escaped newlines (if any still appear)
    .replace(/\n/g, " ") // Replace actual newlines with spaces
    .replace(/\s+/g, " ") // Replace multiple spaces with single space
    .trim();
}

// 🔧 Adapt and validate raw AI response using Zod schema
function adaptAIResponse(rawOutput) {
  // With responseSchema, the rawOutput should largely conform to our expected structure.
  // This function validates the output and ensures type safety using Zod.
  try {
    return ZodNotesSchema.parse(rawOutput);
  } catch (error) {
    console.error("❌ Zod validation failed:", error.message);
    throw new Error(`Invalid response structure: ${error.message}`);
  }
}

/**
 * Fetches detailed, structured notes on a specific subtopic using the Google Gemini API.
 * Returns comprehensive educational content in a structured JSON format with multiple content types.
 *
 * @param {string} topic - The main subject topic (e.g., "MICROPROCESSOR & MICROCONTROLLER")
 * @param {string} syllabus - The syllabus context providing course structure and scope
 * @param {string} subtopic - The specific subtopic to generate detailed notes for (e.g., "Introduction, evolution")
 * @returns {Promise<z.infer<typeof ZodNotesSchema>>} A promise resolving to Zod-validated structured notes
 * @throws {Error} When API calls fail after all retries or when validation fails
 */
export async function GetNotesGemini(topic, syllabus, subtopic) {
  // Validate input parameters
  if (!topic || !syllabus || !subtopic) {
    throw new Error(
      "Missing required parameters: topic, syllabus, and subtopic are all required"
    );
  }

  const genAI = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || "YOUR_BACKUP_API_KEY_HERE",
  });

  // Validate API key
  if (!process.env.GEMINI_API_KEY) {
    console.warn(
      "⚠️ Using backup API key. Please set GEMINI_API_KEY environment variable."
    );
  }

  const prompt = `
    You are an AI tutor providing detailed educational content.
    Generate comprehensive notes in JSON format based on the provided syllabus, subject, and subtopic.

    JSON structure: 'title' (string) and 'content' (array of objects).
    Each content item has a 'type' (string), optional 'heading' (string), and corresponding properties:

    Content types and their properties:
    - "text": 'value' (string, containing Markdown formatting like **bold**, *italic*)
    - "bullet": 'items' (array of strings, each item is a bullet point)
    - "table": 'headers' (array of strings), 'rows' (array of arrays of strings)
    - "code": 'value' (code string), 'language' (string, e.g., 'assembly', 'c', 'javascript')
    - "youtube": 'videoTitle' (string), 'url' (placeholder string, e.g., 'https://www.youtube.com/watch?v=VIDEO_ID')
    - "image": 'description' (string), 'url' (placeholder string, e.g., 'https://via.placeholder.com/600x400/000000/FFFFFF?text=Image')
    - "practiceQuestions": 'items' (array of strings, each item is a practice question)

    Optional 'heading' field can be used for any content type to provide section titles.

    For 'text' content, use Markdown formatting:
    - **Bold text** using double asterisks
    - *Italic text* using single asterisks
    - Keep text clear and concise

    For 'bullet' content, provide an array of clear, informative bullet points.
    
    For 'table' content, structure data logically with appropriate headers and rows.

    For 'practiceQuestions' content, provide an array of relevant practice questions related to the subtopic.

    Ensure total content is at least 200 words. Include definitions, notes, examples, and explanations. Content should be well-structured and educational.

    Syllabus Context: "${syllabus}"
    Subject: "${topic}"
    Subtopic: "${subtopic}"

    INSTRUCTIONS:
    - Use appropriate content types to structure information clearly
    - Mix different content types for better learning experience
    - Ensure all content is educational and relevant to the subtopic
    - Use headings where appropriate to organize content sections
    - Always end with a conclusion followed by practice questions using the "practiceQuestions" type
    

  `;

  const MAX_RETRIES = 3;
  const INITIAL_DELAY_MS = 1000; // 1 second

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      console.log(
        `⚙️ Generating structured notes (Attempt ${
          attempt + 1
        }/${MAX_RETRIES})...`
      );

      const result = await genAI.models.generateContent({
        model: "gemini-2.0-flash", // Cost optimization: $0.10/$0.40 (3x cheaper, still accurate for educational notes)
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: NotesSchema,
        },
      });

      const rawJsonString = result.text;
      console.log("🧠 Raw Gemini JSON Response:\n", rawJsonString);

      // Sanitize and parse the JSON response
      const cleanedJsonString = sanitizeJson(rawJsonString);
      console.log("📦 Cleaned JSON string:\n", cleanedJsonString);

      let rawOutput;
      try {
        rawOutput = JSON.parse(cleanedJsonString);
      } catch (parseError) {
        throw new Error(`JSON parsing failed: ${parseError.message}`);
      }

      // Validate output using Zod schema
      const validatedOutput = adaptAIResponse(rawOutput);

      console.log("✅ Successfully generated and validated structured notes");
      return validatedOutput;
    } catch (err) {
      console.error(
        `❌ Error generating structured notes (Attempt ${attempt + 1}):`,
        err.message
      );

      if (attempt < MAX_RETRIES - 1) {
        const delay = INITIAL_DELAY_MS * Math.pow(2, attempt);
        console.log(`⏳ Retrying in ${delay / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw new Error(
          `Failed to generate structured notes after ${MAX_RETRIES} attempts: ${err.message}`
        );
      }
    }
  }
}

// Example usage (for demonstration purposes):
// async function main() {
//   try {
//     const topic = "MICROPROCESSOR & MICROCONTROLLER";
//     const syllabus = "This syllabus covers Microprocessor & Microcontroller fundamentals. It details the 8086 Microprocessor (architecture, memory, programming, interfacing with 8255, 8251, 8254, 8257, 8259 peripherals) and the 8051 Microcontroller (architecture, memory, I/O, timers, serial communication, programming). Note: Some 8086 introductory concepts were covered in 4th sem.";
//     const subtopic = "Introduction, evolution";
//
//     console.log("Fetching structured notes...");
//     const notes = await GetNotesGemini(topic, syllabus, subtopic);
//     console.log("Successfully retrieved structured notes!");
//     console.log(JSON.stringify(notes, null, 2));
//   } catch (error) {
//     console.error("Failed to retrieve structured notes:", error.message);
//   }
// }
//
// main();
