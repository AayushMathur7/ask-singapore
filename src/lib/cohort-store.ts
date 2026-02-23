import { randomUUID } from "node:crypto";
import type { Doc } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import type { AskResponse, Persona, PersonaResponse } from "@/lib/schemas";
import { createConvexClient } from "@/lib/convex-client";

export type CohortFilters = {
  age_min: number;
  age_max: number;
  sample_size: number;
  occupation_query?: string;
  planning_area_query?: string;
  sex?: string;
};

export type CohortTurn = {
  question: string;
  generated_at: string;
  summary: AskResponse["summary"];
  area_sentiments: AskResponse["area_sentiments"];
  responses: PersonaResponse[];
};

export type CohortRecord = {
  id: string;
  created_at: string;
  filters: CohortFilters;
  total_matches: number;
  personas: Persona[];
  last_turn: CohortTurn | null;
};

function fromConvexCohort(doc: Doc<"cohorts">): CohortRecord {
  return {
    id: doc.cohort_id,
    created_at: doc.created_at,
    filters: doc.filters as CohortFilters,
    total_matches: doc.total_matches,
    personas: doc.personas as Persona[],
    last_turn: (doc.last_turn as CohortTurn | undefined) ?? null,
  };
}

export async function createCohort(params: {
  filters: CohortFilters;
  totalMatches: number;
  personas: Persona[];
}): Promise<CohortRecord> {
  const convex = createConvexClient();
  const cohortId = randomUUID();
  const createdAt = new Date().toISOString();
  const created = await convex.mutation(api.cohorts.create, {
    cohort_id: cohortId,
    created_at: createdAt,
    filters: params.filters,
    total_matches: params.totalMatches,
    personas: params.personas,
    last_turn: undefined,
  });
  if (!created) {
    throw new Error("Failed to create cohort.");
  }
  return fromConvexCohort(created);
}

export async function getCohort(id: string): Promise<CohortRecord | null> {
  const convex = createConvexClient();
  const cohort = await convex.query(api.cohorts.getByCohortId, {
    cohort_id: id,
  });
  if (!cohort) {
    return null;
  }
  return fromConvexCohort(cohort);
}

export async function setCohortLastTurn(
  id: string,
  turn: CohortTurn,
): Promise<CohortRecord | null> {
  const convex = createConvexClient();
  const updated = await convex.mutation(api.cohorts.setLastTurn, {
    cohort_id: id,
    last_turn: turn,
  });
  if (!updated) {
    return null;
  }
  return fromConvexCohort(updated);
}

export function toCohortResponse(cohort: CohortRecord) {
  return {
    cohort_id: cohort.id,
    created_at: cohort.created_at,
    filters: cohort.filters,
    total_matches: cohort.total_matches,
    cohort_size: cohort.personas.length,
    personas: cohort.personas.map((persona) => ({
      uuid: persona.uuid,
      age: persona.age,
      sex: persona.sex,
      occupation: persona.occupation,
      education_level: persona.education_level,
      marital_status: persona.marital_status,
      planning_area: persona.planning_area,
      persona: persona.persona,
    })),
    last_turn: cohort.last_turn,
  };
}
