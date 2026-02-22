import { promises as fs } from "node:fs";
import path from "node:path";
import { AreaProfileSchema, type AreaProfile } from "@/lib/schemas";
import { normalizePlanningArea } from "@/lib/utils";

type AreaProfileStore = {
  profiles: AreaProfile[];
  byArea: Map<string, AreaProfile>;
};

let cache: AreaProfileStore | null = null;

function buildByArea(profiles: AreaProfile[]): Map<string, AreaProfile> {
  const byArea = new Map<string, AreaProfile>();
  for (const profile of profiles) {
    const area = normalizePlanningArea(profile.planning_area);
    byArea.set(area, profile);
  }
  return byArea;
}

export async function getAreaProfileStore(): Promise<AreaProfileStore> {
  if (cache) {
    return cache;
  }

  const filePath = path.join(
    process.cwd(),
    "public",
    "data",
    "area-profiles.json",
  );

  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    cache = { profiles: [], byArea: new Map() };
    return cache;
  }

  const parsed = JSON.parse(raw);
  const profiles = AreaProfileSchema.array().parse(parsed);

  cache = {
    profiles,
    byArea: buildByArea(profiles),
  };

  return cache;
}

export async function getAreaProfile(
  planningArea: string,
): Promise<AreaProfile | null> {
  const store = await getAreaProfileStore();
  return store.byArea.get(normalizePlanningArea(planningArea)) ?? null;
}
