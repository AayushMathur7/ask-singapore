import type { Persona } from "@/lib/schemas";
import { shuffle } from "@/lib/utils";

type PersonaStoreView = {
  personas: Persona[];
  byArea: Map<string, Persona[]>;
};

export type SamplingFilters = {
  age_min: number;
  age_max: number;
  sex?: string;
  occupation_query?: string;
  planning_area_query?: string;
  occupations?: string[];
  planning_areas?: string[];
};

export function filterPersonas(
  personas: Persona[],
  filters: SamplingFilters,
): Persona[] {
  const ageMin = Math.min(filters.age_min, filters.age_max);
  const ageMax = Math.max(filters.age_min, filters.age_max);
  const sexQuery = filters.sex?.toLowerCase().trim();
  const occupationQuery = filters.occupation_query?.toLowerCase().trim();
  const areaQuery = filters.planning_area_query?.toLowerCase().trim();
  const occupations =
    filters.occupations?.map((item) => item.toLowerCase().trim()).filter(Boolean) ?? [];
  const planningAreas =
    filters.planning_areas?.map((item) => item.toLowerCase().trim()).filter(Boolean) ?? [];
  const occupationSet = new Set(occupations);
  const areaSet = new Set(planningAreas);

  return personas.filter((persona) => {
    if (persona.age < ageMin || persona.age > ageMax) {
      return false;
    }
    if (sexQuery && persona.sex.toLowerCase() !== sexQuery) {
      return false;
    }
    if (occupationSet.size > 0 && !occupationSet.has(persona.occupation.toLowerCase().trim())) {
      return false;
    }
    if (
      areaSet.size > 0 &&
      !areaSet.has(persona.planning_area.toLowerCase().trim())
    ) {
      return false;
    }
    if (
      occupationQuery &&
      !persona.occupation.toLowerCase().includes(occupationQuery)
    ) {
      return false;
    }
    if (
      areaQuery &&
      !persona.planning_area.toLowerCase().includes(areaQuery)
    ) {
      return false;
    }
    return true;
  });
}

export function sampleFromCandidates(candidates: Persona[], sampleSize = 20): Persona[] {
  if (candidates.length === 0) {
    return [];
  }

  const byArea = new Map<string, Persona[]>();
  for (const persona of candidates) {
    const list = byArea.get(persona.planning_area);
    if (list) {
      list.push(persona);
    } else {
      byArea.set(persona.planning_area, [persona]);
    }
  }

  const areas = shuffle([...byArea.keys()]);
  const picked = new Map<string, Persona>();

  for (const area of areas) {
    if (picked.size >= sampleSize) {
      break;
    }
    const areaCandidates = byArea.get(area);
    if (!areaCandidates || areaCandidates.length === 0) {
      continue;
    }
    const selected =
      areaCandidates[Math.floor(Math.random() * areaCandidates.length)];
    picked.set(selected.uuid, selected);
  }

  if (picked.size < sampleSize) {
    const remaining = shuffle(candidates);
    for (const persona of remaining) {
      if (picked.size >= sampleSize) {
        break;
      }
      if (!picked.has(persona.uuid)) {
        picked.set(persona.uuid, persona);
      }
    }
  }

  return [...picked.values()];
}

export function samplePersonas(store: PersonaStoreView, sampleSize = 20): Persona[] {
  return sampleFromCandidates(store.personas, sampleSize);
}
