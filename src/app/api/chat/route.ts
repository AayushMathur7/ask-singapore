import { randomUUID } from "node:crypto";
import pLimit from "p-limit";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import {
  streamText,
  type UIMessage,
} from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAreaProfileStore } from "@/lib/area-profiles";
import { getCohort, setCohortLastTurn } from "@/lib/cohort-store";
import { generatePersonaReply } from "@/lib/gemini";
import type { PersonaResponse } from "@/lib/schemas";
import { aggregateSentiment } from "@/lib/sentiment";

const ChatRequestSchema = z.object({
  messages: z.array(z.custom<UIMessage>()),
  cohortId: z.string().optional(),
  cohort_id: z.string().optional(),
});

const workerLimit = pLimit(6);

function extractMessageText(message: UIMessage): string {
  const textParts = message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text.trim())
    .filter(Boolean);
  return textParts.join("\n").trim();
}

function getLastUserQuestion(messages: UIMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== "user") continue;
    const text = extractMessageText(message);
    if (text) return text;
  }
  return null;
}

function buildConversationTranscript(messages: UIMessage[]): string {
  return messages
    .map((message) => {
      const text = extractMessageText(message);
      if (!text) return null;
      const role = message.role === "assistant" ? "Assistant" : "User";
      return `${role}: ${text}`;
    })
    .filter(Boolean)
    .join("\n");
}

function buildFeedbackDigest(responses: PersonaResponse[]): string {
  return responses
    .slice(0, 12)
    .map(
      (item, index) =>
        `${index + 1}. [${item.planning_area} | ${item.profile.age} | ${item.profile.occupation} | ${item.sentiment}] ${item.answer}`,
    )
    .join("\n");
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  try {
    const rawBody = await request.json();
    const parsed = ChatRequestSchema.parse(rawBody);
    const cohortId = parsed.cohortId ?? parsed.cohort_id;
    if (!cohortId) {
      return NextResponse.json(
        { error: "Missing cohortId.", request_id: requestId },
        { status: 400, headers: { "X-Request-Id": requestId } },
      );
    }

    const cohort = getCohort(cohortId);
    if (!cohort) {
      return NextResponse.json(
        { error: "Cohort not found or expired.", request_id: requestId },
        { status: 404, headers: { "X-Request-Id": requestId } },
      );
    }

    const question = getLastUserQuestion(parsed.messages);
    if (!question) {
      return NextResponse.json(
        { error: "No user message found.", request_id: requestId },
        { status: 400, headers: { "X-Request-Id": requestId } },
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Server is missing GEMINI_API_KEY.", request_id: requestId },
        { status: 500, headers: { "X-Request-Id": requestId } },
      );
    }

    const model = "gemini-2.5-flash-lite";
    const areaStore = await getAreaProfileStore();
    const replies = await Promise.allSettled(
      cohort.personas.map((persona) =>
        workerLimit(async () => {
          const areaProfile = areaStore.byArea.get(persona.planning_area);
          const reply = await generatePersonaReply({
            googleApiKey: apiKey,
            question,
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
    if (responses.length < 4) {
      const failures = replies.flatMap((reply) =>
        reply.status === "rejected"
          ? [reply.reason instanceof Error ? reply.reason.message : String(reply.reason)]
          : [],
      );
      return NextResponse.json(
        {
          error: "Not enough persona responses were generated for this turn.",
          request_id: requestId,
          debug_reasons:
            process.env.NODE_ENV === "development" || process.env.ASK_DEBUG === "1"
              ? failures.slice(0, 4)
              : undefined,
        },
        { status: 502, headers: { "X-Request-Id": requestId } },
      );
    }

    const aggregated = aggregateSentiment(responses);
    setCohortLastTurn(cohort.id, {
      question,
      generated_at: new Date().toISOString(),
      summary: aggregated.summary,
      area_sentiments: aggregated.area_sentiments,
      responses,
    });

    const conversationTranscript = buildConversationTranscript(parsed.messages);
    const feedbackDigest = buildFeedbackDigest(responses);
    const summaryModel = "gemini-2.5-flash";
    const google = createGoogleGenerativeAI({ apiKey });

    const result = streamText({
      model: google(summaryModel),
      system:
        "You are a research moderator for synthetic Singapore personas. Be concise and practical. Use plain language, no hype.",
      prompt: [
        `Conversation transcript:\n${conversationTranscript || "No prior transcript."}`,
        `\nCurrent user question: ${question}`,
        `\nPersona response summary: positive=${aggregated.summary.positive}, neutral=${aggregated.summary.neutral}, negative=${aggregated.summary.negative}, total=${aggregated.summary.total}.`,
        `\nSample persona feedback:\n${feedbackDigest}`,
        "\nRespond with:",
        "1) A short direct answer to the user.",
        "2) Key differences across demographics/areas.",
        "3) 2-3 actionable next questions.",
      ].join("\n"),
      temperature: 0.4,
      maxOutputTokens: 420,
      maxRetries: 1,
    });

    return result.toUIMessageStreamResponse({
      headers: {
        "X-Request-Id": requestId,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request.";
    return NextResponse.json(
      { error: message, request_id: requestId },
      { status: 400, headers: { "X-Request-Id": requestId } },
    );
  }
}
