import { randomUUID } from "node:crypto";
import type { AskResponse, Persona, PersonaResponse } from "@/lib/schemas";

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

const MAX_COHORTS = 200;
const cohorts = new Map<string, CohortRecord>();

function pruneIfNeeded() {
  if (cohorts.size < MAX_COHORTS) {
    return;
  }
  const oldest = [...cohorts.values()].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  )[0];
  if (oldest) {
    cohorts.delete(oldest.id);
  }
}

export function createCohort(params: {
  filters: CohortFilters;
  totalMatches: number;
  personas: Persona[];
}): CohortRecord {
  pruneIfNeeded();
  const record: CohortRecord = {
    id: randomUUID(),
    created_at: new Date().toISOString(),
    filters: params.filters,
    total_matches: params.totalMatches,
    personas: params.personas,
    last_turn: null,
  };
  cohorts.set(record.id, record);
  return record;
}

export function getCohort(id: string): CohortRecord | null {
  return cohorts.get(id) ?? null;
}

export function setCohortLastTurn(id: string, turn: CohortTurn): CohortRecord | null {
  const cohort = cohorts.get(id);
  if (!cohort) {
    return null;
  }
  cohort.last_turn = turn;
  return cohort;
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
