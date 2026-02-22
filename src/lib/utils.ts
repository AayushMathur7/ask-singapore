import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function normalizePlanningArea(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, " ");
}

export function shuffle<T>(items: readonly T[]): T[] {
  const clone = [...items];
  for (let i = clone.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [clone[i], clone[j]] = [clone[j], clone[i]];
  }
  return clone;
}

export function getSentimentScore(sentiment: "positive" | "neutral" | "negative"): number {
  if (sentiment === "positive") return 1;
  if (sentiment === "negative") return -1;
  return 0;
}

export function stanceToSentiment(stance: number): "positive" | "neutral" | "negative" {
  if (stance > 0) return "positive";
  if (stance < 0) return "negative";
  return "neutral";
}

export function scoreToSentiment(score: number): "positive" | "neutral" | "negative" {
  if (score > 0.3) return "positive";
  if (score < -0.3) return "negative";
  return "neutral";
}
