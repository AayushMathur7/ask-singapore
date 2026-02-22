import { NextResponse } from "next/server";
import { z } from "zod";
import { createCohort, toCohortResponse, type CohortFilters } from "@/lib/cohort-store";
import { getPersonaStore } from "@/lib/persona-store";
import { sampleFromCandidates } from "@/lib/sampling";

const CreateCohortSchema = z.object({
  age_min: z.coerce.number().int().min(18).max(120).default(20),
  age_max: z.coerce.number().int().min(18).max(120).default(25),
  sample_size: z.coerce.number().int().min(5).max(30).default(20),
  occupation_query: z.string().trim().max(80).optional().default(""),
  planning_area_query: z.string().trim().max(80).optional().default(""),
  sex: z.string().trim().max(20).optional(),
});

function normalizeFilters(input: z.infer<typeof CreateCohortSchema>): CohortFilters {
  const ageMin = Math.min(input.age_min, input.age_max);
  const ageMax = Math.max(input.age_min, input.age_max);
  return {
    age_min: ageMin,
    age_max: ageMax,
    sample_size: input.sample_size,
    occupation_query: input.occupation_query || undefined,
    planning_area_query: input.planning_area_query || undefined,
    sex: input.sex || undefined,
  };
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.json();
    const parsed = CreateCohortSchema.parse(rawBody);
    const filters = normalizeFilters(parsed);
    const store = await getPersonaStore();

    const occupationQuery = filters.occupation_query?.toLowerCase().trim();
    const areaQuery = filters.planning_area_query?.toLowerCase().trim();
    const sexQuery = filters.sex?.toLowerCase().trim();

    const candidates = store.personas.filter((persona) => {
      if (persona.age < filters.age_min || persona.age > filters.age_max) {
        return false;
      }
      if (sexQuery && persona.sex.toLowerCase() !== sexQuery) {
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

    if (candidates.length === 0) {
      return NextResponse.json(
        {
          error:
            "No personas match the selected filters. Try widening the cohort criteria.",
        },
        { status: 404 },
      );
    }

    const cohortPersonas = sampleFromCandidates(
      candidates,
      Math.min(filters.sample_size, candidates.length),
    );
    const cohort = createCohort({
      filters,
      totalMatches: candidates.length,
      personas: cohortPersonas,
    });

    return NextResponse.json(toCohortResponse(cohort), { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
