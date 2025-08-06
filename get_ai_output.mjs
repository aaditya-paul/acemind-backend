import {Ollama} from "@langchain/ollama";
import {PromptTemplate} from "@langchain/core/prompts";
import {SyllabusSchema} from "./ai_outpt_schema.mjs"; // Make sure this is correct

// 🔧 Adapt raw AI response to match your Zod schema
function adaptAIResponse(output) {
  return {
    courseTitle: output.course_title,
    description: output.course_description,
    objectives: output.course_objectives,
    units: output.units.map((u) => ({
      unit_num: String(u.unit_num),
      title: u.title,
      duration: String(u.duration),
      sub_topics: u.sub_topics,
    })),
  };
}

export async function GetAiOutput(topic, syllabus) {
  const ollama = new Ollama({model: "llama3"});

  const prompt = new PromptTemplate({
    template: `
You are an AI assistant that sorts out the syllabus for a given topic.
Please convert the following syllabus into structured JSON.

Use these exact keys:
- course_title (string)
- course_description (string)
- course_objectives (array of strings)
- units (array of objects with keys: unit_num (number), title, duration (number), sub_topics (array))

Wrap your final output strictly inside \`\`\`json code blocks.

Topic: {topic}
Syllabus: {syllabus}
    `,
    inputVariables: ["topic", "syllabus"],
  });

  const chain = prompt.pipe(ollama);

  try {
    console.log("⚙️ Asking Ollama...");
    const response = await chain.invoke({topic, syllabus});

    // 🧠 Inspect raw output
    console.log(
      "🧠 Raw Response from Ollama:\n",
      response?.content || response
    );

    // 🪓 Extract JSON from code block
    const text = response?.content || response;
    const match = text.match(/```json([\s\S]*?)```/);
    if (!match) throw new Error("No JSON block found in response.");
    const jsonString = match[1];

    // 🧾 Parse JSON
    const rawOutput = JSON.parse(jsonString);

    // 🛠 Adapt structure to fit schema
    const adapted = adaptAIResponse(rawOutput);

    // ✅ Validate with Zod
    const validated = SyllabusSchema.parse(adapted);

    console.log("✅ Final Validated Structured Output:\n", validated);
    return validated;
  } catch (err) {
    console.error("❌ Error parsing response:", err.message);
    return null;
  }
}
