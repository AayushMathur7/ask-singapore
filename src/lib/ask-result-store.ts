import { api } from "../../convex/_generated/api";
import type { AskResponse } from "@/lib/schemas";
import { createConvexClient } from "@/lib/convex-client";

export async function persistAskResult(
  response: AskResponse,
  requestId?: string,
): Promise<void> {
  const convex = createConvexClient();
  await convex.mutation(api.askResults.insertOne, {
    created_at: response.generated_at,
    request_id: requestId,
    question: response.question,
    model: response.model,
    summary: response.summary,
    cohort: response.cohort,
    area_sentiments: response.area_sentiments,
    responses: response.responses,
    warnings: response.warnings,
  });
}
