import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { retryWithBackoff } from "./retryUtils.mjs";
import { getModelForService } from "./modelConfig.mjs";

dotenv.config();

export async function GetSyllabusContext(topic, syllabus) {
  const googleGenAI = new GoogleGenAI({
    apiKey: process.env.GOOGLE_API_KEY,
  });

  const prompt = `Provide a short context to store on db and provide as context to llms for the syllabus on the topic: ${topic}. Syllabus details: ${syllabus}
  Instructions :

  Dont include ai text in the response. only provide the context text.
    The context should be a short summary of the syllabus, not more than 150 words.
  `;

  const model = getModelForService("syllabus-context");
  const response = await retryWithBackoff(
    async () =>
      await googleGenAI.models.generateContent({
        model: model,
        contents: [
          {
            role: "user",
            text: prompt,
          },
        ],
      }),
    "GetSyllabusContext"
  );

  return response;
}
