import {GoogleGenAI} from "@google/genai";
import dotenv from "dotenv";
import {z} from "zod"; // Import Zod for validation

dotenv.config();

// Schema for the Gemini API response structure
const ExpandedSubtopicsSchema = {
  type: "OBJECT",
  properties: {
    subtopics: {
      type: "ARRAY",
      items: {
        type: "STRING",
      },
      //   minItems: 4,
      //   maxItems: 4,
    },
  },
  required: ["subtopics"],
};

// Zod schema for client-side validation
const ZodExpandedSubtopicsSchema = z.object({
  //   subtopics: z.array(z.string()).length(4),
  subtopics: z.array(z.string()),
});

// Clean and sanitize JSON response
function sanitizeJson(jsonString) {
  return jsonString
    .replace(/,\s*}/g, "}") // Remove trailing commas in objects
    .replace(/,\s*]/g, "]") // Remove trailing commas in arrays
    .replace(/\\n/g, "") // Remove escaped newlines
    .replace(/\n/g, " ") // Replace actual newlines with spaces
    .replace(/\s+/g, " ") // Replace multiple spaces with single space
    .trim();
}

// Validate response using Zod schema
function validateResponse(rawOutput) {
  try {
    return ZodExpandedSubtopicsSchema.parse(rawOutput);
  } catch (error) {
    console.error("❌ Zod validation failed:", error.message);
    throw new Error(`Invalid response structure: ${error.message}`);
  }
}

/**
 * Generates expanded related subtopic titles for a given subtopic with hierarchical context
 * @param {string} subtopic - The main subtopic to expand upon
 * @param {string} syllabus - The syllabus context
 * @param {string} topic - The main topic
 * @param {string} unitTitle - The unit title
 * @param {number} count - Number of subtopics to generate (default: 4)
 * @param {number} level - The hierarchy level (1, 2, 3, etc.)
 * @param {string} parentContext - Context from parent subtopic
 * @returns {Promise<string[]>} Array of expanded subtopic titles
 */
export async function GetExpandedSubtopics(
  subtopic,
  syllabus,
  topic,
  unitTitle,
  count = 4,
  level = 1,
  parentContext = null
) {
  // Validate input parameters
  if (!subtopic || !syllabus || !topic || !unitTitle) {
    throw new Error(
      "Missing required parameters: subtopic, syllabus, topic, and unitTitle are all required"
    );
  }

  const googleGenAI = new GoogleGenAI({
    apiKey: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY,
  });

  // Validate API key
  if (!process.env.GOOGLE_API_KEY && !process.env.GEMINI_API_KEY) {
    throw new Error(
      "Missing API key: Please set GOOGLE_API_KEY or GEMINI_API_KEY environment variable"
    );
  }

  // Create context-aware prompt based on hierarchy level
  let contextualPrompt = "";
  let depthGuidance = "";

  switch (level) {
    case 1:
      contextualPrompt = `Generate ${count} expanded related subtopic titles for the subtopic: "${subtopic}"`;
      depthGuidance =
        "Focus on broader concepts and main divisions within this subtopic.";
      break;
    case 2:
      contextualPrompt = `Generate ${count} detailed sub-subtopic titles for the expanded topic: "${subtopic}"`;
      depthGuidance =
        "Focus on specific aspects, techniques, or components within this expanded topic.";
      if (parentContext) {
        contextualPrompt += ` (which is a sub-topic of "${parentContext}")`;
      }
      break;
    case 3:
      contextualPrompt = `Generate ${count} specific sub-components for the deep topic: "${subtopic}"`;
      depthGuidance =
        "Focus on very specific elements, methods, or detailed aspects.";
      if (parentContext) {
        contextualPrompt += ` (which is part of the broader concept "${parentContext}")`;
      }
      break;
    default:
      contextualPrompt = `Generate ${count} ultra-specific subtopic elements for: "${subtopic}"`;
      depthGuidance =
        "Focus on highly detailed, technical, or implementation-specific aspects.";
      if (parentContext) {
        contextualPrompt += ` (which is a specialized aspect of "${parentContext}")`;
      }
  }

  const prompt = `
    ${contextualPrompt}
    within the syllabus: "${syllabus}" under the topic: "${topic}" and unit title: "${unitTitle}".
    
    Level ${level} Context: ${depthGuidance}
    
    The subtopics should be relevant and provide deeper understanding at level ${level} of specificity.
    Each subtopic title should be concise and educational, ideally 2-4 words when possible.
    
    For level ${level}, ensure the topics are ${
    level === 1
      ? "broad conceptual areas"
      : level === 2
      ? "specific aspects or methods"
      : level === 3
      ? "detailed components or techniques"
      : "ultra-specific implementation details"
  }.
    
    Return the response in JSON format with the following structure:
    {
      "subtopics": ["subtopic1", "subtopic2", "subtopic3", "subtopic4"]
    }
    
    INSTRUCTIONS:
    - Provide exactly ${count} subtopic titles
    - Keep titles concise and educational
    - Ensure relevance to the main subtopic at level ${level}
    - Use clear, academic language appropriate for level ${level}
    - Maintain consistency with the hierarchical depth
    `;

  const MAX_RETRIES = 3;
  const INITIAL_DELAY_MS = 1000;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      console.log(
        `⚙️ Generating level ${level} expanded subtopics (Attempt ${
          attempt + 1
        }/${MAX_RETRIES})...`
      );

      const response = await googleGenAI.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [{text: prompt}],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: ExpandedSubtopicsSchema,
        },
      });

      const rawJsonString = response.text;
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
      const validatedOutput = validateResponse(rawOutput);

      console.log(
        `✅ Successfully generated level ${level} expanded subtopics`
      );
      return validatedOutput.subtopics;
    } catch (err) {
      console.error(
        `❌ Error generating level ${level} expanded subtopics (Attempt ${
          attempt + 1
        }):`,
        err.message
      );

      if (attempt < MAX_RETRIES - 1) {
        const delay = INITIAL_DELAY_MS * Math.pow(2, attempt);
        console.log(`⏳ Retrying in ${delay / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw new Error(
          `Failed to generate level ${level} expanded subtopics after ${MAX_RETRIES} attempts: ${err.message}`
        );
      }
    }
  }
}
