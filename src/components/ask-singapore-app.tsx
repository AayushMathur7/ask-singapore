"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Send,
  X,
} from "lucide-react";
import { SingaporeMap } from "@/components/singapore-map";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { AskResponse, PersonaResponse } from "@/lib/schemas";

type AskApiResponse = AskResponse & {
  error?: string;
  request_id?: string;
};

type OptionsApiResponse = {
  occupations: string[];
  planning_areas: string[];
  models: Array<{
    id: string;
    label: string;
    provider: "google" | "anthropic" | "openai";
    available: boolean;
  }>;
  default_model: string | null;
  error?: string;
};

const SUGGESTED_QUESTIONS = [
  "Should Singapore raise the retirement age to 70?",
  "Would you support a car-free CBD on weekends?",
  "Is the cost of living in Singapore still manageable for you?",
  "Should HDB flats be built with more 1-2 room units for singles?",
];

function sentimentPillClass(sentiment: "positive" | "neutral" | "negative"): string {
  if (sentiment === "positive") return "pill-positive";
  if (sentiment === "negative") return "pill-negative";
  return "pill-neutral";
}

function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

function MultiSelectFilter(props: {
  label: string;
  value: string[];
  options: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  placeholder: string;
}) {
  const selectedSet = useMemo(() => new Set(props.value), [props.value]);

  const triggerLabel =
    props.value.length === 0
      ? props.placeholder
      : props.value.length <= 2
        ? props.value.join(", ")
        : `${props.value.length} selected`;

  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-medium text-muted-foreground">{props.label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-8 w-full justify-between overflow-hidden text-left text-xs font-normal backdrop-blur-sm"
            disabled={props.disabled}
          >
            <span className="truncate">{triggerLabel}</span>
            <ChevronDown className="size-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="z-50 w-72 p-0" align="start">
          <Command>
            <CommandInput placeholder={`Search ${props.label.toLowerCase()}...`} />
            <CommandList>
              <CommandEmpty>No match found.</CommandEmpty>
              <ScrollArea className="h-52">
                <CommandGroup>
                  {props.options.map((option) => {
                    const checked = selectedSet.has(option);
                    return (
                      <CommandItem
                        key={option}
                        value={option}
                        onSelect={() => {
                          const next = checked
                            ? props.value.filter((item) => item !== option)
                            : [...props.value, option];
                          props.onChange(next);
                        }}
                        className="gap-2"
                      >
                        <Checkbox
                          checked={checked}
                          className="pointer-events-none size-3.5"
                        />
                        <span className="truncate text-xs">{option}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </ScrollArea>
            </CommandList>
          </Command>
          {props.value.length > 0 ? (
            <div className="border-t p-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 text-[11px]"
                onClick={() => props.onChange([])}
              >
                Clear
              </Button>
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function AskSingaporeApp() {
  const [ageMin, setAgeMin] = useState(20);
  const [ageMax, setAgeMax] = useState(25);
  const [sampleSize, setSampleSize] = useState(20);
  const [sex, setSex] = useState("any");
  const [selectedOccupations, setSelectedOccupations] = useState<string[]>([]);
  const [selectedPlanningAreas, setSelectedPlanningAreas] = useState<string[]>([]);
  const [occupationOptions, setOccupationOptions] = useState<string[]>([]);
  const [planningAreaOptions, setPlanningAreaOptions] = useState<string[]>([]);
  const [modelOptions, setModelOptions] = useState<OptionsApiResponse["models"]>([]);
  const [model, setModel] = useState<string>("");
  const [question, setQuestion] = useState("");
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [result, setResult] = useState<AskResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (question.trim() && !isLoading && !isLoadingOptions) {
          handleSubmit(e as unknown as React.FormEvent<HTMLFormElement>);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [question, isLoading, isLoadingOptions],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadOptions() {
      setIsLoadingOptions(true);
      try {
        const response = await fetch("/api/options", { cache: "no-store" });
        const json = (await response.json()) as OptionsApiResponse;
        if (!response.ok) {
          throw new Error(json.error || "Failed to load filter options.");
        }
        if (!cancelled) {
          setOccupationOptions(json.occupations);
          setPlanningAreaOptions(json.planning_areas);
          setModelOptions(json.models || []);
          const firstAvailable = json.models.find((item) => item.available)?.id ?? "";
          const defaultModel =
            json.default_model &&
            json.models.some((item) => item.id === json.default_model && item.available)
              ? json.default_model
              : firstAvailable;
          setModel(defaultModel);
          if (!defaultModel) {
            setError("No model provider configured on server. Add OPENAI_API_KEY, GEMINI_API_KEY, or ANTHROPIC_API_KEY.");
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load filter options.");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingOptions(false);
        }
      }
    }

    void loadOptions();

    return () => {
      cancelled = true;
    };
  }, []);

  const responses = useMemo(() => {
    if (!result) return [];
    const base = selectedArea
      ? result.responses.filter((item) => item.planning_area === selectedArea)
      : result.responses;
    return [...base].sort((a, b) => b.confidence - a.confidence);
  }, [result, selectedArea]);
  const selectedModelLabel =
    modelOptions.find((item) => item.id === model)?.label ?? "Select model";

  async function askQuestion(nextQuestion: string) {
    const cleanedQuestion = nextQuestion.trim();
    if (!cleanedQuestion) {
      setError("Please enter a question first.");
      return;
    }
    if (!model) {
      setError("No model selected.");
      return;
    }
    const selectedModel = modelOptions.find((item) => item.id === model);
    if (!selectedModel?.available) {
      const requiredKey =
        selectedModel?.provider === "anthropic"
          ? "ANTHROPIC_API_KEY"
          : selectedModel?.provider === "openai"
            ? "OPENAI_API_KEY"
            : "GEMINI_API_KEY";
      setError(`Selected model is unavailable on this server. Set ${requiredKey}.`);
      return;
    }

    setIsLoading(true);
    setError(null);
    setSelectedArea(null);

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          question: cleanedQuestion,
          age_min: ageMin,
          age_max: ageMax,
          sample_size: sampleSize,
          sex: sex === "any" ? undefined : sex,
          occupations: selectedOccupations.length > 0 ? selectedOccupations : undefined,
          planning_areas: selectedPlanningAreas.length > 0 ? selectedPlanningAreas : undefined,
          model,
        }),
      });

      const json = (await response.json()) as AskApiResponse;
      if (!response.ok) {
        throw new Error(json.error || "Request failed.");
      }

      setResult(json);
    } catch (submitError) {
      setResult(null);
      setError(submitError instanceof Error ? submitError.message : "Request failed.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await askQuestion(question);
  }

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      {/* z-0: Map fills entire viewport */}
      <SingaporeMap
        areaSentiments={result?.area_sentiments ?? {}}
        selectedArea={selectedArea}
        onSelectArea={setSelectedArea}
        mapboxToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
        className="absolute inset-0"
      />

      {/* z-10: App title */}
      <div className="pointer-events-none absolute top-3 left-1/2 z-10 -translate-x-1/2">
        <div className="glass-card rounded-lg border-0 px-3 py-1.5 shadow-lg">
          <h1 className="text-lg font-semibold tracking-wide text-foreground md:text-xl">Ask Singapore</h1>
        </div>
      </div>

      {/* z-10: Audience filter panel (top-left) */}
      <div className="absolute top-3 left-3 z-10 w-64">
        <Card className="glass-card border-0 py-0 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between px-3 py-2.5">
            <CardTitle className="text-xs font-semibold tracking-wide uppercase">
              Audience
            </CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={() => setFiltersCollapsed(!filtersCollapsed)}
            >
              {filtersCollapsed ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronUp className="size-3.5" />
              )}
            </Button>
          </CardHeader>
          <div
            className={cn(
              "overflow-hidden transition-[max-height,opacity] duration-200 ease-in-out",
              filtersCollapsed
                ? "pointer-events-none max-h-0 opacity-0"
                : "max-h-[40rem] opacity-100",
            )}
            aria-hidden={filtersCollapsed}
          >
            <CardContent className="px-3 pt-0 pb-3">
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-1.5">
                  <div className="space-y-1">
                    <Label htmlFor="age-min" className="text-[11px] font-medium text-muted-foreground">
                      Min Age
                    </Label>
                    <Input
                      id="age-min"
                      type="number"
                      min={18}
                      max={120}
                      value={ageMin}
                      onChange={(event) => setAgeMin(Number(event.target.value))}
                      className="h-7 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="age-max" className="text-[11px] font-medium text-muted-foreground">
                      Max Age
                    </Label>
                    <Input
                      id="age-max"
                      type="number"
                      min={18}
                      max={120}
                      value={ageMax}
                      onChange={(event) => setAgeMax(Number(event.target.value))}
                      className="h-7 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="sample-size" className="text-[11px] font-medium text-muted-foreground">
                      Sample
                    </Label>
                    <Input
                      id="sample-size"
                      type="number"
                      min={5}
                      max={200}
                      value={sampleSize}
                      onChange={(event) => setSampleSize(Number(event.target.value))}
                      className="h-7 text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-medium text-muted-foreground">Sex</Label>
                  <Select value={sex} onValueChange={setSex}>
                    <SelectTrigger className="h-7 w-full text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-50">
                      <SelectItem value="any">Any</SelectItem>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <MultiSelectFilter
                  label="Occupations"
                  value={selectedOccupations}
                  options={occupationOptions}
                  onChange={setSelectedOccupations}
                  disabled={isLoadingOptions}
                  placeholder="All occupations"
                />

                <MultiSelectFilter
                  label="Planning Areas"
                  value={selectedPlanningAreas}
                  options={planningAreaOptions}
                  onChange={setSelectedPlanningAreas}
                  disabled={isLoadingOptions}
                  placeholder="All areas"
                />
              </div>
            </CardContent>
          </div>
        </Card>
      </div>

      {/* z-10: Results panel (right side) */}
      <div className="absolute top-3 right-3 bottom-[76px] z-10 w-96">
        <Card className="glass-card flex h-full flex-col border-0 py-0 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between px-3 py-2.5">
            <CardTitle className="text-xs font-semibold tracking-wide uppercase">
              Results
            </CardTitle>
            {selectedArea ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 gap-1 text-[11px]"
                onClick={() => setSelectedArea(null)}
              >
                {selectedArea}
                <X className="size-3" />
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col px-3 pt-0 pb-3">
            {!result ? (
              <p className="rounded border border-dashed border-border bg-secondary/50 px-2 py-6 text-center text-xs text-muted-foreground">
                Ask a question to see results here.
              </p>
            ) : (
              <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-1.5 pr-2">
                  {responses.length === 0 ? (
                    <p className="py-2 text-xs text-muted-foreground">No responses for this area.</p>
                  ) : (
                    responses.map((item: PersonaResponse) => (
                      <article
                        key={item.uuid}
                        className="rounded-md border border-border bg-secondary/50 p-2"
                      >
                        <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                          <p className="min-w-0">
                            <span className="font-semibold text-foreground">{item.profile.occupation}</span>
                            <span className="mx-0.5 opacity-40">|</span>
                            <span>{item.profile.age}</span>
                            <span className="mx-0.5 opacity-40">|</span>
                            <span>{item.planning_area}</span>
                          </p>
                          <span className={`shrink-0 rounded-full px-1.5 py-px text-[10px] ${sentimentPillClass(item.sentiment)}`}>
                            {item.sentiment}
                          </span>
                          <span className="shrink-0 rounded-full border border-border bg-background/60 px-1.5 py-px text-[10px] text-foreground/80">
                            Confidence {formatConfidence(item.confidence)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-snug text-foreground">{item.answer}</p>
                        {item.reasoning ? (
                          <p className="mt-1 text-[11px] leading-snug text-muted-foreground italic">
                            {item.reasoning}
                          </p>
                        ) : null}
                        {item.area_context ? (
                          <details className="mt-1.5 group">
                            <summary className="cursor-pointer text-[10px] text-muted-foreground/70 hover:text-muted-foreground select-none">
                              Data used
                            </summary>
                            <p className="mt-1 rounded bg-background/50 px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
                              {item.area_context}
                            </p>
                          </details>
                        ) : null}
                      </article>
                    ))
                  )}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* z-20: Question bar (bottom center) */}
      <div className="absolute bottom-3 left-1/2 z-20 w-full max-w-[44rem] -translate-x-1/2 px-4">
        {/* Suggestion pills */}
        <div className="mb-2.5 flex flex-wrap justify-center gap-2">
          {SUGGESTED_QUESTIONS.map((item) => (
            <Badge
              key={item}
              variant="outline"
              className={cn(
                "cursor-pointer bg-secondary/70 px-3 py-1 text-xs backdrop-blur-sm transition hover:bg-secondary",
                (isLoading || isLoadingOptions) && "pointer-events-none opacity-40",
              )}
              onClick={() => {
                if (!isLoading && !isLoadingOptions) {
                  setQuestion(item);
                  textareaRef.current?.focus();
                }
              }}
            >
              {item}
            </Badge>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="relative">
            <Textarea
              ref={textareaRef}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about Singapore..."
              maxLength={280}
              disabled={isLoading || isLoadingOptions}
              className={cn(
                "max-h-[220px] min-h-[76px] resize-none rounded-xl border-border bg-secondary/40 pr-52 text-sm shadow-lg backdrop-blur-sm",
                "focus:border-muted-foreground/40 focus:ring-0 focus-visible:ring-0",
                (isLoading || isLoadingOptions) && "cursor-not-allowed opacity-50",
              )}
              rows={1}
            />
            <div className="absolute right-2 bottom-2 flex items-center gap-1">
              <Popover open={isModelPickerOpen} onOpenChange={setIsModelPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={isLoadingOptions}
                    className="h-8 max-w-40 gap-1 rounded-md border-0 bg-transparent px-2 text-[11px] text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground"
                  >
                    <span className="truncate">{selectedModelLabel}</span>
                    <ChevronDown className="size-3.5 shrink-0 opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-60 p-1" align="end" side="top">
                  <div className="space-y-1">
                    {modelOptions.map((item) => (
                      <Button
                        key={item.id}
                        type="button"
                        variant="ghost"
                        disabled={!item.available}
                        className="h-8 w-full justify-start gap-1 rounded-md border-0 text-left text-xs font-normal"
                        onClick={() => {
                          setModel(item.id);
                          setIsModelPickerOpen(false);
                        }}
                      >
                        <span className="truncate">{item.label}</span>
                        {!item.available ? (
                          <span className="text-[10px] text-muted-foreground">(Unavailable)</span>
                        ) : null}
                      </Button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              {isLoading ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  onClick={() => {/* stop not applicable for non-streaming */}}
                >
                  <Loader2 className="size-4 animate-spin text-cyan-500" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  className="size-8 bg-cyan-700 text-white hover:bg-cyan-800"
                  disabled={
                    !question.trim() ||
                    isLoadingOptions ||
                    !model ||
                    !modelOptions.find((item) => item.id === model)?.available
                  }
                >
                  <Send className="size-4" />
                </Button>
              )}
            </div>
          </div>
        </form>
        {error ? (
          <p className="mt-1.5 rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
            {error}
          </p>
        ) : null}
        <p className="mt-2 text-center text-[10px] leading-relaxed text-muted-foreground/60">
          Responses are AI-generated from synthetic personas — not real opinions.{" "}
          Grounded with{" "}
          <a href="https://www.onemap.gov.sg/apidocs/" target="_blank" rel="noopener noreferrer" className="underline hover:text-muted-foreground">OneMap</a>
          {" "}and{" "}
          <a href="https://data.gov.sg/" target="_blank" rel="noopener noreferrer" className="underline hover:text-muted-foreground">data.gov.sg</a>
          {" "}data. Personas from{" "}
          <a href="https://huggingface.co/datasets/nvidia/Nemotron-Personas-Singapore" target="_blank" rel="noopener noreferrer" className="underline hover:text-muted-foreground">NVIDIA Nemotron</a>.
        </p>
      </div>
    </main>
  );
}
