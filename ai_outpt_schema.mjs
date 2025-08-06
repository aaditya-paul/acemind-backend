// import {z} from "zod";

// const UnitSchema = z.object({
//   unit_num: z.string(), // e.g., "UNIT 1"
//   title: z.string(), // e.g., "Basics of Mobile Communications"
//   duration: z.string(), // e.g., "10 hours"
//   sub_topics: z.array(z.string()), // each topic is a string
// });

// // const AssessmentSchema = z.object({
// //   unitTests: z.string(),
// //   midTermExam: z.string(),
// //   finalExam: z.string(),
// // });

// export const SyllabusSchema = z.object({
//   courseTitle: z.string(),
//   description: z.string(),
//   objectives: z.array(z.string()),
//   units: z.array(UnitSchema),
//   // assessment: AssessmentSchema,
// });

import {z} from "zod";

export const SyllabusSchema = z.object({
  courseTitle: z.string(),
  description: z.string(),
  objectives: z.array(z.string()),
  units: z.array(
    z.object({
      unit_num: z.string(),
      title: z.string(),
      duration: z.number(),
      sub_topics: z.array(z.string()),
    })
  ),
});

// Schema for different types of content based on subject
const CodeSnippetSchema = z.object({
  language: z.string(),
  code: z.string(),
  explanation: z.string().optional(),
});

const EquationSchema = z.object({
  equation: z.string(),
  explanation: z.string(),
  steps: z.array(z.string()).optional(),
});

const BookReferenceSchema = z.object({
  title: z.string(),
  author: z.string(),
  quote: z.string().optional(),
  context: z.string(),
});

const DiagramDescriptionSchema = z.object({
  title: z.string(),
  description: z.string(),
  components: z.array(z.string()).optional(),
});

const ConceptExplanationSchema = z.object({
  concept: z.string(),
  definition: z.string(),
  analogy: z.string().optional(),
  examples: z.array(z.string()).optional(),
});

// Main content block that can contain different types of educational content
const ContentBlockSchema = z.object({
  type: z.enum([
    "explanation",
    "code",
    "equation",
    "book_reference",
    "diagram",
    "concept",
    "example",
    "analogy",
  ]),
  content: z.union([
    z.string(),
    CodeSnippetSchema,
    EquationSchema,
    BookReferenceSchema,
    DiagramDescriptionSchema,
    ConceptExplanationSchema,
  ]),
  importance: z.enum(["high", "medium", "low"]).optional(),
});

// Section schema for organizing content
const SectionSchema = z.object({
  title: z.string(),
  summary: z.string(),
  content_blocks: z.array(ContentBlockSchema),
  key_points: z.array(z.string()),
  difficulty_level: z.enum(["beginner", "intermediate", "advanced"]),
});

// Main teaching notes schema
export const NotesSchema = z.object({
  topic: z.string(),
  subject_area: z.string(), // e.g., "Computer Science", "Mathematics", "English Literature"
  learning_objectives: z.array(z.string()),
  prerequisite_knowledge: z.array(z.string()).optional(),
  sections: z.array(SectionSchema),
  summary: z.string(),
  further_reading: z.array(z.string()).optional(),
  practice_questions: z.array(z.string()).optional(),
});
