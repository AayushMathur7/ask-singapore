import { ConvexHttpClient } from "convex/browser";

export function createConvexClient(): ConvexHttpClient {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    throw new Error(
      "NEXT_PUBLIC_CONVEX_URL is not set. Run `npx convex dev` and ensure .env.local is loaded.",
    );
  }
  return new ConvexHttpClient(convexUrl);
}
