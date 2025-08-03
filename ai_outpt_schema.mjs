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

// export const MobileComputingSyllabusSchema = z.object({
//   courseTitle: z.string(),
//   description: z.string(),
//   objectives: z.array(z.string()),
//   units: z.array(UnitSchema),
//   // assessment: AssessmentSchema,
// });

import {z} from "zod";

export const MobileComputingSyllabusSchema = z.object({
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
