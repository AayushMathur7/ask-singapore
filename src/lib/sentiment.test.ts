import { describe, expect, it } from "vitest";
import { aggregateSentiment } from "./sentiment";
import type { PersonaResponse } from "./schemas";

function response(input: Partial<PersonaResponse>): PersonaResponse {
  return {
    uuid: input.uuid ?? "id-1",
    planning_area: input.planning_area ?? "ANG MO KIO",
    profile: {
      age: 28,
      sex: "Female",
      occupation: "Designer",
      education_level: "Diploma",
    },
    answer: input.answer ?? "Test answer",
    reasoning: input.reasoning ?? "",
    area_context: input.area_context ?? "",
    sentiment: input.sentiment ?? "neutral",
    stance: input.stance ?? 0,
    confidence: input.confidence ?? 0.5,
    score: input.score ?? 0,
  };
}

describe("aggregateSentiment", () => {
  it("computes summary counts", () => {
    const output = aggregateSentiment([
      response({ sentiment: "positive" }),
      response({ sentiment: "neutral" }),
      response({ sentiment: "negative" }),
    ]);

    expect(output.summary.total).toBe(3);
    expect(output.summary.positive).toBe(1);
    expect(output.summary.neutral).toBe(1);
    expect(output.summary.negative).toBe(1);
    expect(output.summary.mean_score).toBe(0);
  });

  it("computes area-level aggregate sentiment", () => {
    const output = aggregateSentiment([
      response({ uuid: "1", planning_area: "A", sentiment: "positive", score: 0.8 }),
      response({ uuid: "2", planning_area: "A", sentiment: "positive", score: 0.7 }),
      response({ uuid: "3", planning_area: "A", sentiment: "negative", score: -0.2 }),
      response({ uuid: "4", planning_area: "B", sentiment: "negative", score: -1.0 }),
    ]);

    expect(output.area_sentiments.A.count).toBe(3);
    expect(output.area_sentiments.A.sentiment).toBe("positive");
    expect(output.area_sentiments.B.sentiment).toBe("negative");
  });
});
