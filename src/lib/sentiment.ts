import type { AskResponse, PersonaResponse, Sentiment } from "@/lib/schemas";
import { getSentimentScore, scoreToSentiment } from "@/lib/utils";

export function aggregateSentiment(responses: PersonaResponse[]): Pick<AskResponse, "summary" | "area_sentiments"> {
  const summary = {
    total: responses.length,
    positive: 0,
    neutral: 0,
    negative: 0,
    mean_score: 0,
  };

  const bucket = new Map<string, { totalScore: number; count: number }>();
  let totalScore = 0;

  for (const response of responses) {
    summary[response.sentiment] += 1;
    const responseScore =
      typeof response.score === "number"
        ? response.score
        : getSentimentScore(response.sentiment);
    totalScore += responseScore;

    const current = bucket.get(response.planning_area) ?? {
      totalScore: 0,
      count: 0,
    };
    current.totalScore += responseScore;
    current.count += 1;
    bucket.set(response.planning_area, current);
  }
  summary.mean_score = responses.length > 0 ? totalScore / responses.length : 0;

  const areaSentiments: AskResponse["area_sentiments"] = {};
  for (const [area, item] of bucket.entries()) {
    const score = item.totalScore / item.count;
    areaSentiments[area] = {
      count: item.count,
      score,
      sentiment: scoreToSentiment(score) as Sentiment,
    };
  }

  return {
    summary,
    area_sentiments: areaSentiments,
  };
}
