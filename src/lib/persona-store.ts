import { promises as fs } from "node:fs";
import path from "node:path";
import { PersonaSchema, type Persona } from "@/lib/schemas";
import { normalizePlanningArea } from "@/lib/utils";

type PersonaStore = {
  personas: Persona[];
  byArea: Map<string, Persona[]>;
};

export type PersonaFilterOptions = {
  occupations: string[];
  planning_areas: string[];
};

let cache: PersonaStore | null = null;

function buildByArea(personas: Persona[]): Map<string, Persona[]> {
  const byArea = new Map<string, Persona[]>();
  for (const persona of personas) {
    const area = normalizePlanningArea(persona.planning_area);
    const current = byArea.get(area);
    if (current) {
      current.push(persona);
    } else {
      byArea.set(area, [persona]);
    }
  }
  return byArea;
}

export async function getPersonaStore(): Promise<PersonaStore> {
  if (cache) {
    return cache;
  }

  const filePath = path.join(
    process.cwd(),
    "public",
    "data",
    "personas.compact.v1.json",
  );
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);
  const personas = PersonaSchema.array().parse(parsed).map((persona) => ({
    ...persona,
    planning_area: normalizePlanningArea(persona.planning_area),
  }));

  cache = {
    personas,
    byArea: buildByArea(personas),
  };

  return cache;
}

export async function getPersonaFilterOptions(): Promise<PersonaFilterOptions> {
  const store = await getPersonaStore();
  const occupations = [...new Set(store.personas.map((persona) => persona.occupation))].sort(
    (a, b) => a.localeCompare(b),
  );
  const planningAreas = [...new Set(store.personas.map((persona) => persona.planning_area))].sort(
    (a, b) => a.localeCompare(b),
  );
  return {
    occupations,
    planning_areas: planningAreas,
  };
}
