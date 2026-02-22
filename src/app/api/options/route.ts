import { NextResponse } from "next/server";
import {
  getAllModelOptions,
  getAvailableModelOptions,
  getDefaultModelId,
} from "@/lib/model-catalog";
import { getPersonaFilterOptions } from "@/lib/persona-store";

export async function GET() {
  try {
    const options = await getPersonaFilterOptions();
    const availableModelIds = new Set(
      getAvailableModelOptions().map((model) => model.id),
    );
    const models = getAllModelOptions().map((model) => ({
      id: model.id,
      label: model.label,
      provider: model.provider,
      available: availableModelIds.has(model.id),
    }));
    const configuredDefaultModel = getDefaultModelId();
    const defaultModel = models.some(
      (item) => item.id === configuredDefaultModel && item.available,
    )
      ? configuredDefaultModel
      : (models.find((item) => item.available)?.id ?? null);
    const payload = {
      ...options,
      models,
      default_model: defaultModel,
    };
    return NextResponse.json(payload, {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load options.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
