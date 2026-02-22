#!/usr/bin/env python3
"""
Prepare compact persona JSON for Ask Singapore from NVIDIA parquet files.

Usage:
  python3 scripts/prepare_personas.py
  python3 scripts/prepare_personas.py --sample-size 5000 --seed 42
  python3 scripts/prepare_personas.py --input /path/to/train-00000.parquet /path/to/train-00001.parquet
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Iterable

import polars as pl

DEFAULT_INPUTS = [
    "https://huggingface.co/datasets/nvidia/Nemotron-Personas-Singapore/resolve/main/data/train-00000-of-00002.parquet",
    "https://huggingface.co/datasets/nvidia/Nemotron-Personas-Singapore/resolve/main/data/train-00001-of-00002.parquet",
]

REQUIRED_COLUMNS = [
    "uuid",
    "age",
    "sex",
    "occupation",
    "education_level",
    "marital_status",
    "planning_area",
    "persona",
    "cultural_background",
    "skills_and_expertise",
    "skills_and_expertise_list",
    "hobbies_and_interests",
    "hobbies_and_interests_list",
    "career_goals_and_ambitions",
]


def normalize_planning_area(value: str) -> str:
    return " ".join(value.strip().upper().split())


def compact_text(value: str, max_len: int) -> str:
    compact = " ".join(value.strip().split())
    if len(compact) <= max_len:
        return compact
    return compact[: max_len - 3].rstrip() + "..."


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Prepare compact Ask Singapore persona data.")
    parser.add_argument(
        "--input",
        nargs="+",
        default=DEFAULT_INPUTS,
        help="One or more parquet paths or URLs.",
    )
    parser.add_argument(
        "--output",
        default="public/data/personas.compact.v1.json",
        help="Output JSON file path.",
    )
    parser.add_argument(
        "--meta-output",
        default="public/data/personas.compact.v1.meta.json",
        help="Output metadata JSON file path.",
    )
    parser.add_argument(
        "--sample-size",
        type=int,
        default=5000,
        help="Number of rows to keep in output.",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Sampling seed.",
    )
    return parser.parse_args()


def read_parquets(paths: Iterable[str]) -> pl.DataFrame:
    frames = []
    for parquet_path in paths:
        frame = pl.read_parquet(parquet_path, columns=REQUIRED_COLUMNS)
        frames.append(frame)
    return pl.concat(frames, how="vertical_relaxed")


def stratified_sample(df: pl.DataFrame, sample_size: int, seed: int) -> pl.DataFrame:
    areas = df.select("planning_area").unique().to_series().to_list()
    areas = [area for area in areas if isinstance(area, str) and area]

    if not areas:
        raise RuntimeError("No planning areas found after cleaning.")

    per_area_target = max(1, sample_size // len(areas))
    sampled_frames = []
    for idx, area in enumerate(areas):
        area_df = df.filter(pl.col("planning_area") == area)
        if area_df.height == 0:
            continue
        n = min(per_area_target, area_df.height)
        sampled_frames.append(area_df.sample(n=n, with_replacement=False, shuffle=True, seed=seed + idx))

    sampled = pl.concat(sampled_frames, how="vertical_relaxed") if sampled_frames else df.head(0)
    if sampled.height >= sample_size:
        return sampled.sample(n=sample_size, with_replacement=False, shuffle=True, seed=seed + 997)

    remaining_count = sample_size - sampled.height
    remaining = (
        df.join(sampled.select("uuid"), on="uuid", how="anti")
        .sample(
            n=min(remaining_count, max(0, df.height - sampled.height)),
            with_replacement=False,
            shuffle=True,
            seed=seed + 2048,
        )
    )
    return pl.concat([sampled, remaining], how="vertical_relaxed")


def main() -> None:
    args = parse_args()
    output = Path(args.output)
    meta_output = Path(args.meta_output)
    output.parent.mkdir(parents=True, exist_ok=True)
    meta_output.parent.mkdir(parents=True, exist_ok=True)

    df = read_parquets(args.input)
    before = df.height
    df = df.drop_nulls(["uuid", "planning_area", "persona", "age", "sex", "occupation"])
    df = df.with_columns(
        [
            pl.col("planning_area").cast(pl.Utf8).map_elements(normalize_planning_area).alias("planning_area"),
            pl.col("age").cast(pl.Int64),
            pl.col("sex").cast(pl.Utf8),
            pl.col("occupation").cast(pl.Utf8),
            pl.col("education_level").cast(pl.Utf8),
            pl.col("marital_status").cast(pl.Utf8),
            pl.col("persona").cast(pl.Utf8).map_elements(lambda x: compact_text(x, 180)).alias("persona"),
            pl.col("cultural_background")
            .cast(pl.Utf8)
            .fill_null("")
            .map_elements(lambda x: compact_text(x, 120))
            .alias("cultural_background"),
            pl.coalesce([pl.col("skills_and_expertise_list"), pl.col("skills_and_expertise")])
            .cast(pl.Utf8)
            .fill_null("")
            .map_elements(lambda x: compact_text(x, 110))
            .alias("skills_and_expertise"),
            pl.coalesce([pl.col("hobbies_and_interests_list"), pl.col("hobbies_and_interests")])
            .cast(pl.Utf8)
            .fill_null("")
            .map_elements(lambda x: compact_text(x, 110))
            .alias("hobbies_and_interests"),
            pl.col("career_goals_and_ambitions")
            .cast(pl.Utf8)
            .fill_null("")
            .map_elements(lambda x: compact_text(x, 110))
            .alias("career_goals_and_ambitions"),
        ]
    )
    df = df.select(
        [
            "uuid",
            "age",
            "sex",
            "occupation",
            "education_level",
            "marital_status",
            "planning_area",
            "persona",
            "cultural_background",
            "skills_and_expertise",
            "hobbies_and_interests",
            "career_goals_and_ambitions",
        ]
    )
    df = df.filter((pl.col("age") >= 18) & (pl.col("age") <= 120))
    sampled = stratified_sample(df, args.sample_size, args.seed)

    records = sampled.to_dicts()
    with output.open("w", encoding="utf-8") as fp:
        json.dump(records, fp, ensure_ascii=True, separators=(",", ":"))

    meta = {
        "source_inputs": args.input,
        "rows_before_cleaning": before,
        "rows_after_cleaning": df.height,
        "rows_exported": sampled.height,
        "unique_planning_areas": sampled.select("planning_area").n_unique(),
        "sample_size_target": args.sample_size,
        "seed": args.seed,
    }
    with meta_output.open("w", encoding="utf-8") as fp:
        json.dump(meta, fp, ensure_ascii=True, indent=2)

    print(f"Wrote {sampled.height} records to {output}")
    print(f"Wrote metadata to {meta_output}")


if __name__ == "__main__":
    main()
