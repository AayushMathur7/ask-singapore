"use client";

import type { Feature, Polygon, MultiPolygon } from "geojson";
import { useMemo } from "react";
import type { MapLayerMouseEvent } from "mapbox-gl";
import Map, {
  Layer,
  NavigationControl,
  Source,
  type LayerProps,
} from "react-map-gl/mapbox";
import type { AskResponse } from "@/lib/schemas";
import { cn } from "@/lib/utils";

type Props = {
  areaSentiments: AskResponse["area_sentiments"];
  selectedArea: string | null;
  onSelectArea: (area: string | null) => void;
  mapboxToken: string | undefined;
  className?: string;
};

const singaporeCenter = {
  latitude: 1.3521,
  longitude: 103.8198,
  zoom: 10.5,
};

const lineLayer: LayerProps = {
  id: "planning-outline",
  type: "line",
  paint: {
    "line-color": "rgba(148, 163, 184, 0.3)",
    "line-width": 0.8,
  },
};

function colorForSentiment(sentiment: "positive" | "neutral" | "negative"): string {
  if (sentiment === "positive") return "#22c55e";
  if (sentiment === "negative") return "#ef4444";
  return "#f59e0b";
}

export function SingaporeMap({
  areaSentiments,
  selectedArea,
  onSelectArea,
  mapboxToken,
  className,
}: Props) {
  const fillExpression = useMemo(() => {
    const expression: (string | string[] | number)[] = ["match", ["get", "PLN_AREA_N"]];
    for (const [area, sentiment] of Object.entries(areaSentiments)) {
      expression.push(area, colorForSentiment(sentiment.sentiment));
    }
    expression.push("rgba(148, 163, 184, 0.12)");
    return expression;
  }, [areaSentiments]);

  const fillColor = useMemo(
    () =>
      Object.keys(areaSentiments).length > 0
        ? (fillExpression as unknown as string)
        : "rgba(148, 163, 184, 0.12)",
    [areaSentiments, fillExpression],
  );

  const fillLayer = useMemo<LayerProps>(
    () => ({
      id: "planning-fill",
      type: "fill",
      paint: {
        "fill-color": fillColor,
        "fill-opacity": 0.72,
      },
    }),
    [fillColor],
  );

  const selectedLayer: LayerProps = {
    id: "planning-selected-outline",
    type: "line",
    filter: selectedArea
      ? ["==", ["get", "PLN_AREA_N"], selectedArea]
      : ["==", ["get", "PLN_AREA_N"], "__none__"],
    paint: {
      "line-color": "#22d3ee",
      "line-width": 2.8,
    },
  };

  if (!mapboxToken) {
    return (
      <div className="glass-card rounded-2xl border border-amber-500/30 p-5 text-sm text-amber-400">
        Map unavailable. Set <code>NEXT_PUBLIC_MAPBOX_TOKEN</code> to render Singapore planning areas.
      </div>
    );
  }

  return (
    <div
      className={cn("h-full w-full", className)}
    >
      <Map
        reuseMaps
        mapboxAccessToken={mapboxToken}
        initialViewState={singaporeCenter}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        interactiveLayerIds={["planning-fill"]}
        onClick={(event: MapLayerMouseEvent) => {
          const feature = event.features?.[0] as
            | Feature<Polygon | MultiPolygon, { PLN_AREA_N?: string }>
            | undefined;
          const area = feature?.properties?.PLN_AREA_N ?? null;
          onSelectArea(area);
        }}
      >
        <NavigationControl position="bottom-right" showCompass={false} />
        <Source id="sg-subzones" type="geojson" data="/data/singapore-subzone-no-sea.geojson">
          <Layer {...fillLayer} />
          <Layer {...lineLayer} />
          <Layer {...selectedLayer} />
        </Source>
      </Map>
    </div>
  );
}
