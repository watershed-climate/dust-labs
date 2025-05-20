import { z } from "zod";

export const TranslationRequestBody = z.object({
  layers: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
    })
  ),
  targetLanguage: z.string(), // Add targetLanguage to the schema
});

export const EnhancementRequestBody = z.object({
  layers: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
    })
  ),
});

export type TranslationRequestBody = z.infer<typeof TranslationRequestBody>;
export type EnhancementRequestBody = z.infer<typeof EnhancementRequestBody>;
