import { z } from "zod";
import { SUPPORTED_MODEL_IDS } from "@/lib/model-catalog";

export const SentimentSchema = z.enum(["positive", "neutral", "negative"]);
export type Sentiment = z.infer<typeof SentimentSchema>;

export const PersonaSchema = z.object({
  uuid: z.string().min(1),
  age: z.number().int().min(18).max(120),
  sex: z.string().min(1),
  occupation: z.string().min(1),
  education_level: z.string().min(1),
  marital_status: z.string().min(1),
  planning_area: z.string().min(1),
  persona: z.string().min(1),
  cultural_background: z.string().optional().default(""),
  skills_and_expertise: z.string().optional().default(""),
  hobbies_and_interests: z.string().optional().default(""),
  career_goals_and_ambitions: z.string().optional().default(""),
});
export type Persona = z.infer<typeof PersonaSchema>;

export const AreaProfileSchema = z.object({
  planning_area: z.string().min(1),
  population: z.number().int().nonnegative(),
  dominant_age_group: z.string(),
  dominant_ethnic_group: z.string(),
  dominant_dwelling_type: z.string(),
  median_income_bracket: z.string(),
  primary_transport_mode: z.string(),
  owner_occupier_pct: z.number().min(0).max(100),
  median_hdb_resale_4room: z.number().nonnegative().nullable(),
  hawker_centre_count: z.number().int().nonnegative(),
  supermarket_count: z.number().int().nonnegative().optional().default(0),
  school_count: z.number().int().nonnegative().optional().default(0),
  clinic_count: z.number().int().nonnegative().optional().default(0),
  summary: z.string().max(600),
});
export type AreaProfile = z.infer<typeof AreaProfileSchema>;

export const AskRequestSchema = z.object({
  question: z
    .string()
    .trim()
    .min(4, "Please enter at least 4 characters.")
    .max(280, "Please keep the question under 280 characters."),
  age_min: z.coerce.number().int().min(18).max(120).default(20),
  age_max: z.coerce.number().int().min(18).max(120).default(25),
  sample_size: z.coerce.number().int().min(5).max(200).default(20),
  sex: z.string().trim().max(20).optional(),
  occupation_query: z.string().trim().max(80).optional(),
  planning_area_query: z.string().trim().max(80).optional(),
  occupations: z.array(z.string().trim().min(1).max(120)).max(40).optional(),
  planning_areas: z.array(z.string().trim().min(1).max(120)).max(80).optional(),
  model: z.enum(SUPPORTED_MODEL_IDS).optional(),
});
export type AskRequest = z.infer<typeof AskRequestSchema>;

export const PersonaReplySchema = z.object({
  answer: z.string().min(5).max(700),
  reasoning: z.string().max(300).optional().default(""),
  stance: z.number().int().min(-2).max(2),
  confidence: z.number().min(0).max(1),
});
export type PersonaReply = z.infer<typeof PersonaReplySchema>;

export const PersonaResponseSchema = z.object({
  uuid: z.string(),
  planning_area: z.string(),
  profile: z.object({
    age: z.number().int(),
    sex: z.string(),
    occupation: z.string(),
    education_level: z.string(),
  }),
  answer: z.string(),
  reasoning: z.string().optional().default(""),
  area_context: z.string().optional().default(""),
  sentiment: SentimentSchema,
  stance: z.number().int().min(-2).max(2),
  confidence: z.number().min(0).max(1),
  score: z.number().min(-2).max(2),
});
export type PersonaResponse = z.infer<typeof PersonaResponseSchema>;

export const AreaSentimentSchema = z.object({
  count: z.number().int().min(0),
  score: z.number(),
  sentiment: SentimentSchema,
});
export type AreaSentiment = z.infer<typeof AreaSentimentSchema>;

export const AskResponseSchema = z.object({
  question: z.string(),
  model: z.enum(SUPPORTED_MODEL_IDS),
  generated_at: z.string(),
  summary: z.object({
    total: z.number().int().min(0),
    positive: z.number().int().min(0),
    neutral: z.number().int().min(0),
    negative: z.number().int().min(0),
    mean_score: z.number().min(-2).max(2),
  }),
  cohort: z.object({
    total_matches: z.number().int().min(0),
    sampled: z.number().int().min(0),
    filters: z.object({
      age_min: z.number().int().min(18).max(120),
      age_max: z.number().int().min(18).max(120),
      sample_size: z.number().int().min(5).max(200),
      sex: z.string().trim().max(20).optional(),
      occupation_query: z.string().trim().max(80).optional(),
      planning_area_query: z.string().trim().max(80).optional(),
      occupations: z.array(z.string().trim().min(1).max(120)).max(40).optional(),
      planning_areas: z.array(z.string().trim().min(1).max(120)).max(80).optional(),
    }),
  }),
  area_sentiments: z.record(z.string(), AreaSentimentSchema),
  responses: z.array(PersonaResponseSchema),
  warnings: z.array(z.string()).optional(),
});
export type AskResponse = z.infer<typeof AskResponseSchema>;
