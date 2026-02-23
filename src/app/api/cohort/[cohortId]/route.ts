import { NextResponse } from "next/server";
import { getCohort, toCohortResponse } from "@/lib/cohort-store";

type RouteParams = {
  params: Promise<{
    cohortId: string;
  }>;
};

export async function GET(_: Request, context: RouteParams) {
  const { cohortId } = await context.params;
  const cohort = await getCohort(cohortId);
  if (!cohort) {
    return NextResponse.json(
      { error: "Cohort not found or expired." },
      { status: 404 },
    );
  }
  return NextResponse.json(toCohortResponse(cohort), { status: 200 });
}
