import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const insertOne = mutation({
  args: {
    created_at: v.string(),
    request_id: v.optional(v.string()),
    question: v.string(),
    model: v.string(),
    summary: v.any(),
    cohort: v.any(),
    area_sentiments: v.any(),
    responses: v.array(v.any()),
    warnings: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("ask_results", {
      created_at: args.created_at,
      request_id: args.request_id,
      question: args.question,
      model: args.model,
      summary: args.summary,
      cohort: args.cohort,
      area_sentiments: args.area_sentiments,
      responses: args.responses,
      warnings: args.warnings,
    });
  },
});
