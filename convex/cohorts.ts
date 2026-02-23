import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: {
    cohort_id: v.string(),
    created_at: v.string(),
    filters: v.any(),
    total_matches: v.number(),
    personas: v.array(v.any()),
    last_turn: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("cohorts")
      .withIndex("by_cohort_id", (q) => q.eq("cohort_id", args.cohort_id))
      .first();
    if (existing) {
      return existing;
    }

    const insertedId = await ctx.db.insert("cohorts", {
      cohort_id: args.cohort_id,
      created_at: args.created_at,
      filters: args.filters,
      total_matches: args.total_matches,
      personas: args.personas,
      last_turn: args.last_turn,
    });
    return await ctx.db.get(insertedId);
  },
});

export const getByCohortId = query({
  args: {
    cohort_id: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("cohorts")
      .withIndex("by_cohort_id", (q) => q.eq("cohort_id", args.cohort_id))
      .first();
  },
});

export const setLastTurn = mutation({
  args: {
    cohort_id: v.string(),
    last_turn: v.any(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("cohorts")
      .withIndex("by_cohort_id", (q) => q.eq("cohort_id", args.cohort_id))
      .first();
    if (!existing) {
      return null;
    }

    await ctx.db.patch(existing._id, {
      last_turn: args.last_turn,
    });
    return await ctx.db.get(existing._id);
  },
});
