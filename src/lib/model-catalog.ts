export const SUPPORTED_MODEL_IDS = [
  "gpt-5-nano",
  "gpt-5-mini",
  "gpt-5.2",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "claude-sonnet-4-6",
  "claude-sonnet-4-5",
] as const;

export type SupportedModelId = (typeof SUPPORTED_MODEL_IDS)[number];

export type ModelProvider = "google" | "anthropic" | "openai";

type RequiredEnvKey = "GEMINI_API_KEY" | "ANTHROPIC_API_KEY" | "OPENAI_API_KEY";

export type ModelOption = {
  id: SupportedModelId;
  label: string;
  provider: ModelProvider;
  requiredEnv: RequiredEnvKey;
  fallback: SupportedModelId;
};

const MODEL_CATALOG: ModelOption[] = [
  {
    id: "gpt-5-nano",
    label: "GPT-5 Nano",
    provider: "openai",
    requiredEnv: "OPENAI_API_KEY",
    fallback: "gpt-5-mini",
  },
  {
    id: "gpt-5-mini",
    label: "GPT-5 Mini",
    provider: "openai",
    requiredEnv: "OPENAI_API_KEY",
    fallback: "gpt-5-mini",
  },
  {
    id: "gpt-5.2",
    label: "GPT-5.2",
    provider: "openai",
    requiredEnv: "OPENAI_API_KEY",
    fallback: "gpt-5-mini",
  },
  {
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    provider: "anthropic",
    requiredEnv: "ANTHROPIC_API_KEY",
    fallback: "claude-sonnet-4-5",
  },
  {
    id: "claude-sonnet-4-5",
    label: "Claude Sonnet 4.5",
    provider: "anthropic",
    requiredEnv: "ANTHROPIC_API_KEY",
    fallback: "claude-sonnet-4-5",
  },
  {
    id: "gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash-Lite",
    provider: "google",
    requiredEnv: "GEMINI_API_KEY",
    fallback: "gemini-2.5-flash",
  },
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    provider: "google",
    requiredEnv: "GEMINI_API_KEY",
    fallback: "gemini-2.5-flash",
  },
];

const FALLBACK_DEFAULT_MODEL: SupportedModelId = "gpt-5-nano";

export function isSupportedModelId(modelId: string): modelId is SupportedModelId {
  return SUPPORTED_MODEL_IDS.includes(modelId as SupportedModelId);
}

export function getModelOption(modelId: SupportedModelId): ModelOption {
  const option = MODEL_CATALOG.find((item) => item.id === modelId);
  if (!option) {
    throw new Error(`Unsupported model: ${modelId}`);
  }
  return option;
}

export function getAllModelOptions(): ModelOption[] {
  return [...MODEL_CATALOG];
}

export function getAvailableModelOptions(
  env: NodeJS.ProcessEnv = process.env,
): ModelOption[] {
  return MODEL_CATALOG.filter((option) => Boolean(env[option.requiredEnv]));
}

export function getDefaultModelId(
  env: NodeJS.ProcessEnv = process.env,
): SupportedModelId {
  const availableModels = getAvailableModelOptions(env);
  const firstAvailable = availableModels[0];
  if (firstAvailable) {
    return firstAvailable.id;
  }

  return FALLBACK_DEFAULT_MODEL;
}
