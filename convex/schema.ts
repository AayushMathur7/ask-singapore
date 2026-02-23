import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const sentimentValidator = v.union(
  v.literal("positive"),
  v.literal("neutral"),
  v.literal("negative"),
);

const personaValidator = v.object({
  uuid: v.string(),
  age: v.number(),
  sex: v.string(),
  occupation: v.string(),
  education_level: v.string(),
  marital_status: v.string(),
  planning_area: v.string(),
  persona: v.string(),
  cultural_background: v.optional(v.string()),
  skills_and_expertise: v.optional(v.string()),
  hobbies_and_interests: v.optional(v.string()),
  career_goals_and_ambitions: v.optional(v.string()),
});

const personaResponseValidator = v.object({
  uuid: v.string(),
  planning_area: v.string(),
  profile: v.object({
    age: v.number(),
    sex: v.string(),
    occupation: v.string(),
    education_level: v.string(),
  }),
  answer: v.string(),
  reasoning: v.optional(v.string()),
  area_context: v.optional(v.string()),
  sentiment: sentimentValidator,
  stance: v.number(),
  confidence: v.number(),
  score: v.number(),
});

const summaryValidator = v.object({
  total: v.number(),
  positive: v.number(),
  neutral: v.number(),
  negative: v.number(),
  mean_score: v.number(),
});

const areaSentimentValidator = v.object({
  count: v.number(),
  score: v.number(),
  sentiment: sentimentValidator,
});

const cohortFiltersValidator = v.object({
  age_min: v.number(),
  age_max: v.number(),
  sample_size: v.number(),
  occupation_query: v.optional(v.string()),
  planning_area_query: v.optional(v.string()),
  sex: v.optional(v.string()),
});

const askFiltersValidator = v.object({
  age_min: v.number(),
  age_max: v.number(),
  sample_size: v.number(),
  sex: v.optional(v.string()),
  occupation_query: v.optional(v.string()),
  planning_area_query: v.optional(v.string()),
  occupations: v.optional(v.array(v.string())),
  planning_areas: v.optional(v.array(v.string())),
});

const cohortTurnValidator = v.object({
  question: v.string(),
  generated_at: v.string(),
  summary: summaryValidator,
  area_sentiments: v.record(v.string(), areaSentimentValidator),
  responses: v.array(personaResponseValidator),
});

export default defineSchema({
  ask_results: defineTable({
    created_at: v.string(),
    request_id: v.optional(v.string()),
    question: v.string(),
    model: v.string(),
    summary: summaryValidator,
    cohort: v.object({
      total_matches: v.number(),
      sampled: v.number(),
      filters: askFiltersValidator,
    }),
    area_sentiments: v.record(v.string(), areaSentimentValidator),
    responses: v.array(personaResponseValidator),
    warnings: v.optional(v.array(v.string())),
  })
    .index("by_created_at", ["created_at"])
    .index("by_model_created_at", ["model", "created_at"]),

  cohorts: defineTable({
    cohort_id: v.string(),
    created_at: v.string(),
    filters: cohortFiltersValidator,
    total_matches: v.number(),
    personas: v.array(personaValidator),
    last_turn: v.optional(cohortTurnValidator),
  })
    .index("by_cohort_id", ["cohort_id"])
    .index("by_created_at", ["created_at"]),
});
