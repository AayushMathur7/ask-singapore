import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { getModelOption, type SupportedModelId } from "@/lib/model-catalog";
import { PersonaReplySchema, type Persona } from "@/lib/schemas";
import { stanceToSentiment } from "@/lib/utils";

function createPrompt(question: string, persona: Persona, areaContext?: string): string {
  const lines = [
    "You are role-playing a synthetic persona from Singapore.",
    "Answer naturally in 2-3 sentences, grounded in the profile below.",
    "Do not mention that you are an AI model.",
    "Use this stance rubric about the user's question:",
    "-2 = definitely would not, -1 = probably would not, 0 = unsure/depends, 1 = probably would, 2 = definitely would.",
    "Set confidence from 0 to 1 based on how clearly this persona profile supports the stance.",
    "Avoid defaulting to neutral unless uncertainty is genuine.",
    "",
    `Question: ${question}`,
    "",
    "Persona Profile:",
    `- Age: ${persona.age}`,
    `- Sex: ${persona.sex}`,
    `- Occupation: ${persona.occupation}`,
    `- Education level: ${persona.education_level}`,
    `- Marital status: ${persona.marital_status}`,
    `- Planning area: ${persona.planning_area}`,
    `- Background: ${persona.cultural_background || "Not provided."}`,
    `- Skills: ${persona.skills_and_expertise || "Not provided."}`,
    `- Hobbies: ${persona.hobbies_and_interests || "Not provided."}`,
    `- Career goals: ${persona.career_goals_and_ambitions || "Not provided."}`,
    `- General persona summary: ${persona.persona}`,
  ];

  if (areaContext) {
    lines.push("");
    lines.push(`Neighborhood context for ${persona.planning_area}: ${areaContext}`);
  }

  lines.push("");
  lines.push('Return strict JSON only with this shape: {"answer":"...","reasoning":"1-sentence explaining key assumptions and neighborhood facts behind your stance","stance":-2|-1|0|1|2,"confidence":0..1}');

  return lines.join("\n");
}

export async function generatePersonaReply(params: {
  googleApiKey?: string;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  question: string;
  persona: Persona;
  model: SupportedModelId;
  areaContext?: string;
}): Promise<{
  answer: string;
  reasoning: string;
  stance: -2 | -1 | 0 | 1 | 2;
  confidence: number;
  score: number;
  sentiment: "positive" | "neutral" | "negative";
}> {
  const selectedModel = getModelOption(params.model);
  const fallbackModel = getModelOption(selectedModel.fallback);
  const candidates = [selectedModel, fallbackModel].filter(
    (candidate, index, arr) =>
      arr.findIndex((item) => item.id === candidate.id) === index,
  );

  const google =
    params.googleApiKey ? createGoogleGenerativeAI({ apiKey: params.googleApiKey }) : null;
  const anthropic =
    params.anthropicApiKey ? createAnthropic({ apiKey: params.anthropicApiKey }) : null;
  const openai = params.openaiApiKey ? createOpenAI({ apiKey: params.openaiApiKey }) : null;

  let lastError: Error | null = null;
  const attemptFailures: string[] = [];
  for (const candidate of candidates) {
    const modelHandle =
      candidate.provider === "google"
        ? google?.(candidate.id)
        : candidate.provider === "anthropic"
          ? anthropic?.(candidate.id)
          : openai?.(candidate.id);

    if (!modelHandle) {
      attemptFailures.push(
        `${candidate.id}: Missing required API key for ${candidate.provider}.`,
      );
      continue;
    }

    const providerOptions =
      candidate.provider === "anthropic"
        ? {
            anthropic: {
              structuredOutputMode: "jsonTool" as const,
              cacheControl: {
                type: "ephemeral" as const,
                ttl: "5m" as const,
              },
            },
          }
        : undefined;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const controller = new AbortController();
      const timeoutMs =
        candidate.provider === "anthropic" ? 22000 : 10000;
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const result = await generateObject({
          model: modelHandle,
          providerOptions,
          schema: PersonaReplySchema,
          prompt: createPrompt(params.question, params.persona, params.areaContext),
          temperature: 0.6,
          maxOutputTokens: 220,
          abortSignal: controller.signal,
          maxRetries: 0,
        });
        const stance = result.object.stance as -2 | -1 | 0 | 1 | 2;
        const confidence = Math.max(0, Math.min(1, result.object.confidence));
        const score = Number((stance * confidence).toFixed(3));
        return {
          answer: result.object.answer,
          reasoning: result.object.reasoning ?? "",
          stance,
          confidence,
          score,
          sentiment: stanceToSentiment(stance),
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown model provider error.";
        attemptFailures.push(
          `${candidate.id}#${attempt + 1}: ${message.replace(/\s+/g, " ").slice(0, 240)}`,
        );
        lastError = error instanceof Error ? error : new Error("Unknown model provider error.");
        if (attempt < 2) {
          const delayMs = candidate.provider === "anthropic" ? 900 : 220;
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      } finally {
        clearTimeout(timeout);
      }
    }
  }

  if (attemptFailures.length > 0) {
    throw new Error(
      `Model generation failed after ${attemptFailures.length} attempts. ${attemptFailures.join(" || ")}`,
    );
  }

  throw lastError ?? new Error("Model request failed.");
}
