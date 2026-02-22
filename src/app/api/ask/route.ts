import { randomUUID } from "node:crypto";
import pLimit from "p-limit";
import { NextRequest, NextResponse } from "next/server";
import { getAreaProfileStore } from "@/lib/area-profiles";
import { generatePersonaReply } from "@/lib/gemini";
import {
  getAvailableModelOptions,
  getDefaultModelId,
} from "@/lib/model-catalog";
import { getPersonaStore } from "@/lib/persona-store";
import { checkRateLimit } from "@/lib/rate-limit";
import { filterPersonas, sampleFromCandidates } from "@/lib/sampling";
import { AskRequestSchema, AskResponseSchema } from "@/lib/schemas";
import { aggregateSentiment } from "@/lib/sentiment";

const workerLimit = pLimit(6);
const MAX_DEBUG_FAILURES = 8;

function isDebugEnabled(): boolean {
  return process.env.NODE_ENV === "development" || process.env.ASK_DEBUG === "1";
}

function summarizeFailureReasons(reasons: string[]): Array<{ reason: string; count: number }> {
  const counts = new Map<string, number>();
  for (const reason of reasons) {
    const normalized = reason
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 180);
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([reason, count]) => ({ reason, count }));
}

function getClientIp(req: NextRequest): string {
  const xForwardedFor = req.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    return xForwardedFor.split(",")[0]?.trim() ?? "unknown";
  }
  return "unknown";
}

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  try {
    const rawBody = await request.json();
    const parsedBody = AskRequestSchema.parse(rawBody);
    const googleApiKey = process.env.GEMINI_API_KEY;
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    const openaiApiKey = process.env.OPENAI_API_KEY;

    const ip = getClientIp(request);
    const rate = checkRateLimit(`ask:${ip}`, 20, 10 * 60 * 1000);
    if (!rate.allowed) {
      return NextResponse.json(
        {
          error: "Too many requests. Please wait and try again.",
          request_id: requestId,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rate.retryAfterSeconds),
            "X-Request-Id": requestId,
          },
        },
      );
    }

    const [store, areaStore] = await Promise.all([
      getPersonaStore(),
      getAreaProfileStore(),
    ]);
    const availableModels = getAvailableModelOptions();
    if (availableModels.length === 0) {
      return NextResponse.json(
        {
          error:
            "No model provider is configured. Set OPENAI_API_KEY, GEMINI_API_KEY, and/or ANTHROPIC_API_KEY.",
          request_id: requestId,
        },
        { status: 500, headers: { "X-Request-Id": requestId } },
      );
    }

    const model = parsedBody.model ?? getDefaultModelId();
    const isModelAvailable = availableModels.some((option) => option.id === model);
    if (!isModelAvailable) {
      return NextResponse.json(
        {
          error: `Model "${model}" is not available on this server.`,
          request_id: requestId,
          available_models: availableModels.map((option) => option.id),
        },
        { status: 400, headers: { "X-Request-Id": requestId } },
      );
    }

    const ageMin = Math.min(parsedBody.age_min, parsedBody.age_max);
    const ageMax = Math.max(parsedBody.age_min, parsedBody.age_max);
    const filters = {
      age_min: ageMin,
      age_max: ageMax,
      sample_size: parsedBody.sample_size,
      sex: parsedBody.sex?.trim() || undefined,
      occupation_query: parsedBody.occupation_query?.trim() || undefined,
      planning_area_query: parsedBody.planning_area_query?.trim() || undefined,
      occupations:
        parsedBody.occupations && parsedBody.occupations.length > 0
          ? [...new Set(parsedBody.occupations.map((item) => item.trim()).filter(Boolean))]
          : undefined,
      planning_areas:
        parsedBody.planning_areas && parsedBody.planning_areas.length > 0
          ? [...new Set(parsedBody.planning_areas.map((item) => item.trim()).filter(Boolean))]
          : undefined,
    };

    const candidates = filterPersonas(store.personas, filters);
    const sampled = sampleFromCandidates(
      candidates,
      Math.min(filters.sample_size, candidates.length),
    );
    if (sampled.length === 0) {
      return NextResponse.json(
        {
          error:
            "No personas match the selected filters. Try widening the cohort criteria.",
          request_id: requestId,
        },
        { status: 404, headers: { "X-Request-Id": requestId } },
      );
    }

    const replies = await Promise.allSettled(
      sampled.map((persona) =>
        workerLimit(async () => {
          const areaProfile = areaStore.byArea.get(persona.planning_area);
          const reply = await generatePersonaReply({
            googleApiKey,
            anthropicApiKey,
            openaiApiKey,
            question: parsedBody.question,
            persona,
            model,
            areaContext: areaProfile?.summary,
          });
          return {
            uuid: persona.uuid,
            planning_area: persona.planning_area,
            profile: {
              age: persona.age,
              sex: persona.sex,
              occupation: persona.occupation,
              education_level: persona.education_level,
            },
            answer: reply.answer,
            reasoning: reply.reasoning,
            area_context: areaProfile?.summary ?? "",
            sentiment: reply.sentiment,
            stance: reply.stance,
            confidence: reply.confidence,
            score: reply.score,
          };
        }),
      ),
    );

    const responses = replies.flatMap((reply) =>
      reply.status === "fulfilled" ? [reply.value] : [],
    );
    const failureDetails = replies.flatMap((reply, index) => {
      if (reply.status !== "rejected") {
        return [];
      }
      const persona = sampled[index];
      const reason = (
        reply.reason instanceof Error ? reply.reason.message : String(reply.reason)
      )
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 400);
      return [
        {
          uuid: persona?.uuid,
          planning_area: persona?.planning_area,
          occupation: persona?.occupation,
          reason,
        },
      ];
    });
    const failureReasons = failureDetails.map((item) => item.reason);
    const reasonCounts = summarizeFailureReasons(failureReasons);

    const failures = replies.length - responses.length;
    if (responses.length < 5) {
      console.error("[/api/ask] insufficient model responses", {
        request_id: requestId,
        model,
        failed_calls: failures,
        successful_calls: responses.length,
        reason_counts: reasonCounts,
        sample_failures: failureDetails.slice(0, MAX_DEBUG_FAILURES),
      });

      return NextResponse.json(
        {
          error:
            "Model provider did not return enough responses. Please try again.",
          request_id: requestId,
          model,
          sample_size: sampled.length,
          total_matches: candidates.length,
          failed_calls: failures,
          successful_calls: responses.length,
          debug:
            isDebugEnabled()
              ? {
                  reason_counts: reasonCounts,
                  failures: failureDetails.slice(0, MAX_DEBUG_FAILURES),
                }
              : undefined,
        },
        { status: 502, headers: { "X-Request-Id": requestId } },
      );
    }

    const aggregated = aggregateSentiment(responses);
    const payload = AskResponseSchema.parse({
      question: parsedBody.question,
      model,
      generated_at: new Date().toISOString(),
      summary: aggregated.summary,
      cohort: {
        total_matches: candidates.length,
        sampled: sampled.length,
        filters,
      },
      area_sentiments: aggregated.area_sentiments,
      responses,
      warnings:
        failures > 0
          ? [`${failures} persona responses failed and were skipped.`]
          : [],
    });

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "X-Request-Id": requestId,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error.";
    console.error("[/api/ask] unhandled error", {
      request_id: requestId,
      error: message,
    });
    return NextResponse.json(
      { error: message, request_id: requestId },
      { status: 400, headers: { "X-Request-Id": requestId } },
    );
  }
}
