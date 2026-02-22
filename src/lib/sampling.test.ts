import { describe, expect, it } from "vitest";
import { filterPersonas, samplePersonas } from "./sampling";
import type { Persona } from "./schemas";

function persona(id: string, area: string): Persona {
  return {
    uuid: id,
    age: 30,
    sex: "Male",
    occupation: "Engineer",
    education_level: "Bachelor",
    marital_status: "Single",
    planning_area: area,
    persona: "Test persona",
    cultural_background: "Test",
    skills_and_expertise: "Test",
    hobbies_and_interests: "Test",
    career_goals_and_ambitions: "Test",
  };
}

describe("samplePersonas", () => {
  it("returns requested count with unique UUIDs when enough data exists", () => {
    const personas = Array.from({ length: 40 }, (_, idx) =>
      persona(`id-${idx}`, idx < 20 ? "AREA A" : "AREA B"),
    );
    const byArea = new Map<string, Persona[]>();
    byArea.set(
      "AREA A",
      personas.filter((item) => item.planning_area === "AREA A"),
    );
    byArea.set(
      "AREA B",
      personas.filter((item) => item.planning_area === "AREA B"),
    );

    const sampled = samplePersonas({ personas, byArea }, 20);
    expect(sampled).toHaveLength(20);
    expect(new Set(sampled.map((item) => item.uuid)).size).toBe(20);
  });

  it("returns all available personas if sample size exceeds dataset", () => {
    const personas = [persona("a", "AREA A"), persona("b", "AREA B")];
    const byArea = new Map<string, Persona[]>([
      ["AREA A", [personas[0]]],
      ["AREA B", [personas[1]]],
    ]);

    const sampled = samplePersonas({ personas, byArea }, 20);
    expect(sampled).toHaveLength(2);
  });
});

describe("filterPersonas", () => {
  it("filters by age range, sex, and text queries", () => {
    const personas = [
      { ...persona("a", "TAMPINES"), age: 22, sex: "Female", occupation: "Student" },
      { ...persona("b", "BEDOK"), age: 24, sex: "Male", occupation: "Engineer" },
      { ...persona("c", "TAMPINES"), age: 34, sex: "Female", occupation: "Teacher" },
    ];

    const filtered = filterPersonas(personas, {
      age_min: 20,
      age_max: 25,
      sex: "female",
      occupation_query: "stud",
      planning_area_query: "tam",
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.uuid).toBe("a");
  });
});
