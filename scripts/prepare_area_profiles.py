#!/usr/bin/env python3
"""
Prepare area-profiles.json for Ask Singapore.

Fetches real Singapore government data from OneMap Population API and data.gov.sg,
computes per-planning-area statistics, and outputs a concise neighborhood profile
for each of the 55 URA planning areas.

Usage:
  python3 scripts/prepare_area_profiles.py

Requires env vars: ONEMAP_EMAIL, ONEMAP_PASSWORD
Dependencies: requests, shapely
"""

from __future__ import annotations

import json
import os
import sys

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass
import time
from pathlib import Path
from typing import Any

import requests
from shapely.geometry import MultiPolygon, Point, Polygon, shape

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

ONEMAP_AUTH_URL = "https://www.onemap.gov.sg/api/auth/post/getToken"
ONEMAP_BASE = "https://www.onemap.gov.sg/api/public/popapi"

ONEMAP_ENDPOINTS = {
    "economic_status": "getEconomicStatus",
    "ethnic_group": "getEthnicGroup",
    "age_group": "getPopulationAgeGroup",
    "income": "getHouseholdMonthlyIncomeWork",
    "dwelling": "getTypeOfDwellingHousehold",
    "transport": "getModeOfTransportWork",
    "tenancy": "getTenancyType",
}

# data.gov.sg dataset IDs
HDB_RESALE_DATASET = "d_8b84c4ee58e3cfc0ece0d773c8ca6abc"
HAWKER_DATASET = "d_4a086da0a5553be1d89383cd90d07ecd"
SUPERMARKET_DATASET = "d_cac2c32f01960a3ad7202a99c27268a0"
SCHOOL_DATASET = "d_688b934f82c1059ed0a6993d2a829089"
CLINIC_DATASET = "d_e4663ad3f088a46dabd3972dc166402d"

# Latest available year for OneMap population data
POPULATION_YEAR = "2020"

OUTPUT_PATH = Path("public/data/area-profiles.json")

GEOJSON_PATH = Path("public/data/singapore-subzone-no-sea.geojson")

# Planning areas that are non-residential
NON_RESIDENTIAL_AREAS = {
    "CENTRAL WATER CATCHMENT",
    "CHANGI BAY",
    "LHSOUTHERN ISLANDS",
    "MARINA EAST",
    "MARINA SOUTH",
    "NORTH-EASTERN ISLANDS",
    "PANDAN",
    "SIMPANG",
    "STRAITS VIEW",
    "TENGAH",
    "TUAS",
    "WESTERN ISLANDS",
    "WESTERN WATER CATCHMENT",
    "LIM CHU KANG",
    "MANDAI",
    "SUNGEI KADUT",
    "PIONEER",
    "CHANGI",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def get_onemap_token() -> str:
    """Authenticate with OneMap and return access token."""
    email = os.environ.get("ONEMAP_EMAIL", "")
    password = os.environ.get("ONEMAP_PASSWORD", "")
    if not email or not password:
        print("ERROR: Set ONEMAP_EMAIL and ONEMAP_PASSWORD env vars.", file=sys.stderr)
        sys.exit(1)

    resp = requests.post(
        ONEMAP_AUTH_URL,
        json={"email": email, "password": password},
        timeout=30,
    )
    if not resp.ok:
        print(f"ERROR: OneMap auth returned {resp.status_code}: {resp.text}", file=sys.stderr)
        sys.exit(1)
    data = resp.json()
    token = data.get("access_token", "")
    if not token:
        print(f"ERROR: OneMap auth failed: {data}", file=sys.stderr)
        sys.exit(1)
    return token


def fetch_onemap_data(
    token: str, endpoint: str, planning_area: str, year: str = POPULATION_YEAR
) -> list[dict[str, Any]]:
    """Fetch a single OneMap population endpoint for a planning area."""
    url = f"{ONEMAP_BASE}/{endpoint}"
    params = {"planningArea": planning_area, "year": year}
    headers = {"Authorization": f"Bearer {token}"}
    time.sleep(0.15)  # Rate-limit courtesy
    try:
        resp = requests.get(url, params=params, headers=headers, timeout=30)
        if resp.status_code == 404:
            return []
        if resp.status_code == 401:
            print(f"  WARN: 401 for {endpoint} {planning_area}", file=sys.stderr)
            return []
        resp.raise_for_status()
        result = resp.json()
        if isinstance(result, list):
            return result
        # Some endpoints return a single-element wrapper
        if isinstance(result, dict):
            # Handle {"Result": "No Data Found!"} responses
            if result.get("Result") == "No Data Found!":
                return []
            return [result]
        return []
    except Exception as exc:
        print(f"  WARN: {endpoint} for {planning_area}: {exc}", file=sys.stderr)
        return []


def find_dominant(data: list[dict[str, Any]], exclude_keys: set[str] | None = None) -> tuple[str, int]:
    """Find the key with the highest numeric value in a flat dict, excluding specified keys."""
    if not data:
        return ("Unknown", 0)
    exclude = exclude_keys or set()
    best_key, best_val = "Unknown", 0
    for record in data:
        for key, val in record.items():
            if key.lower() in exclude:
                continue
            try:
                num = int(val)
            except (ValueError, TypeError):
                continue
            if num > best_val:
                best_val = num
                best_key = key
                best_val = num
    return (best_key, best_val)


def get_total_population(age_data: list[dict[str, Any]]) -> int:
    """Sum all age group values to get total population."""
    total = 0
    exclude = {"planning_area", "year", "gender"}
    for record in age_data:
        for key, val in record.items():
            if key.lower() in exclude:
                continue
            try:
                total += int(val)
            except (ValueError, TypeError):
                continue
    return total


def compute_owner_occupier_pct(tenancy_data: list[dict[str, Any]]) -> float:
    """Compute percentage of owner-occupied dwellings."""
    owner = 0
    total = 0
    for record in tenancy_data:
        for key, val in record.items():
            try:
                num = int(val)
            except (ValueError, TypeError):
                continue
            if key.lower() in {"planning_area", "year", "gender"}:
                continue
            total += num
            if "owner" in key.lower():
                owner += num
    if total == 0:
        return 0.0
    return round(owner / total * 100, 1)


# ---------------------------------------------------------------------------
# data.gov.sg helpers
# ---------------------------------------------------------------------------


def fetch_with_retry(url: str, timeout: int = 60, max_retries: int = 3) -> requests.Response:
    """Fetch a URL with exponential backoff on 429/5xx."""
    for attempt in range(max_retries):
        resp = requests.get(url, timeout=timeout)
        if resp.status_code == 429 or resp.status_code >= 500:
            wait = 2 ** (attempt + 1)
            print(f"  Rate limited ({resp.status_code}), waiting {wait}s...", file=sys.stderr)
            time.sleep(wait)
            continue
        return resp
    return resp  # Return last response even if failed


def fetch_hdb_resale_prices() -> dict[str, float]:
    """Fetch HDB resale flat prices and compute median 4-room price per town."""
    print("Fetching HDB resale prices from data.gov.sg...")

    all_records: list[dict[str, Any]] = []

    # Paginate through results with smaller pages
    offset = 0
    limit = 5000
    while True:
        page_url = f"https://data.gov.sg/api/action/datastore_search?resource_id={HDB_RESALE_DATASET}&limit={limit}&offset={offset}&filters=%7B%22flat_type%22%3A%224%20ROOM%22%7D"
        try:
            resp = fetch_with_retry(page_url)
            resp.raise_for_status()
            data = resp.json()
            records = data.get("result", {}).get("records", [])
            if not records:
                break
            all_records.extend(records)
            total = data.get("result", {}).get("total", 0)
            offset += limit
            print(f"  Fetched {len(all_records)}/{total} records...")
            if offset >= total:
                break
            time.sleep(0.5)  # Be polite
        except Exception as exc:
            print(f"  WARN: HDB resale fetch at offset {offset}: {exc}", file=sys.stderr)
            break

    print(f"  Fetched {len(all_records)} 4-room resale records")

    # Group prices by town (last 2 years only for recency)
    from collections import defaultdict

    town_prices: dict[str, list[float]] = defaultdict(list)
    for record in all_records:
        town = str(record.get("town", "")).strip().upper()
        price = record.get("resale_price")
        month = str(record.get("month", ""))
        if not town or price is None:
            continue
        # Only use recent transactions (last 2 years)
        if month >= "2023-01":
            try:
                town_prices[town].append(float(price))
            except (ValueError, TypeError):
                continue

    # Compute median per town
    medians: dict[str, float] = {}
    for town, prices in town_prices.items():
        if prices:
            sorted_prices = sorted(prices)
            mid = len(sorted_prices) // 2
            if len(sorted_prices) % 2 == 0:
                medians[town] = round((sorted_prices[mid - 1] + sorted_prices[mid]) / 2)
            else:
                medians[town] = round(sorted_prices[mid])

    print(f"  Computed median prices for {len(medians)} towns")
    return medians


def fetch_hawker_centres(area_polygons: dict[str, Polygon | MultiPolygon]) -> dict[str, int]:
    """Fetch hawker centre locations and count per planning area via point-in-polygon."""
    print("Fetching hawker centre locations from data.gov.sg...")
    url = f"https://data.gov.sg/api/action/datastore_search?resource_id={HAWKER_DATASET}&limit=200"

    try:
        resp = fetch_with_retry(url, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        print(f"  WARN: Hawker centre fetch failed: {exc}", file=sys.stderr)
        # Fallback: try GeoJSON endpoint
        return fetch_hawker_centres_geojson(area_polygons)

    records = data.get("result", {}).get("records", [])
    if not records:
        return fetch_hawker_centres_geojson(area_polygons)

    # Try to get coordinates from records
    counts: dict[str, int] = {area: 0 for area in area_polygons}
    matched = 0

    for record in records:
        lat = record.get("latitude_hd") or record.get("latitude")
        lng = record.get("longitude_hd") or record.get("longitude")
        if lat is None or lng is None:
            continue
        try:
            point = Point(float(lng), float(lat))
        except (ValueError, TypeError):
            continue

        for area_name, polygon in area_polygons.items():
            if polygon.contains(point):
                counts[area_name] = counts.get(area_name, 0) + 1
                matched += 1
                break

    print(f"  Matched {matched} hawker centres to planning areas")
    return counts


def fetch_hawker_centres_geojson(area_polygons: dict[str, Polygon | MultiPolygon]) -> dict[str, int]:
    """Fallback: fetch hawker centre GeoJSON and count per planning area."""
    print("  Trying GeoJSON endpoint for hawker centres...")
    url = f"https://api-open.data.gov.sg/v1/public/api/datasets/{HAWKER_DATASET}/poll-download"

    counts: dict[str, int] = {area: 0 for area in area_polygons}

    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        result = resp.json()
        download_url = result.get("data", {}).get("url")
        if not download_url:
            print("  WARN: No download URL for hawker GeoJSON", file=sys.stderr)
            return counts

        resp2 = requests.get(download_url, timeout=60)
        resp2.raise_for_status()
        geojson = resp2.json()
    except Exception as exc:
        print(f"  WARN: Hawker GeoJSON fetch failed: {exc}", file=sys.stderr)
        return counts

    features = geojson.get("features", [])
    matched = 0
    for feature in features:
        geom = feature.get("geometry")
        if not geom:
            continue
        try:
            point = shape(geom)
            if not isinstance(point, Point):
                point = point.centroid
        except Exception:
            continue

        for area_name, polygon in area_polygons.items():
            if polygon.contains(point):
                counts[area_name] = counts.get(area_name, 0) + 1
                matched += 1
                break

    print(f"  Matched {matched} hawker centres from GeoJSON")
    return counts


def count_amenity_geojson(
    dataset_id: str,
    label: str,
    area_polygons: dict[str, Polygon | MultiPolygon],
) -> dict[str, int]:
    """Generic: fetch a data.gov.sg GeoJSON dataset and count points per planning area."""
    print(f"Fetching {label} from data.gov.sg...")
    counts: dict[str, int] = {area: 0 for area in area_polygons}

    # Try the poll-download endpoint for GeoJSON
    url = f"https://api-open.data.gov.sg/v1/public/api/datasets/{dataset_id}/poll-download"
    try:
        resp = fetch_with_retry(url, timeout=30)
        resp.raise_for_status()
        result = resp.json()
        download_url = result.get("data", {}).get("url")
        if not download_url:
            # Fallback: try datastore search for lat/lng records
            return _count_amenity_datastore(dataset_id, label, area_polygons)

        resp2 = fetch_with_retry(download_url, timeout=60)
        resp2.raise_for_status()
        data = resp2.json()
    except Exception as exc:
        print(f"  WARN: {label} GeoJSON fetch failed: {exc}", file=sys.stderr)
        return _count_amenity_datastore(dataset_id, label, area_polygons)

    features = data.get("features", [])
    if not features:
        # Might be a CSV-style response, try datastore
        return _count_amenity_datastore(dataset_id, label, area_polygons)

    matched = 0
    for feature in features:
        geom = feature.get("geometry")
        if not geom:
            continue
        try:
            point = shape(geom)
            if not isinstance(point, Point):
                point = point.centroid
        except Exception:
            continue
        for area_name, polygon in area_polygons.items():
            if polygon.contains(point):
                counts[area_name] = counts.get(area_name, 0) + 1
                matched += 1
                break

    print(f"  Matched {matched} {label}")
    return counts


def _count_amenity_datastore(
    dataset_id: str,
    label: str,
    area_polygons: dict[str, Polygon | MultiPolygon],
) -> dict[str, int]:
    """Fallback: try datastore API for records with lat/lng columns."""
    print(f"  Trying datastore API for {label}...")
    counts: dict[str, int] = {area: 0 for area in area_polygons}
    url = f"https://data.gov.sg/api/action/datastore_search?resource_id={dataset_id}&limit=5000"
    try:
        resp = fetch_with_retry(url, timeout=30)
        resp.raise_for_status()
        records = resp.json().get("result", {}).get("records", [])
    except Exception as exc:
        print(f"  WARN: {label} datastore fetch failed: {exc}", file=sys.stderr)
        return counts

    matched = 0
    for record in records:
        lat = record.get("latitude") or record.get("lat") or record.get("LATITUDE")
        lng = record.get("longitude") or record.get("lng") or record.get("LONGITUDE")
        if lat is None or lng is None:
            continue
        try:
            point = Point(float(lng), float(lat))
        except (ValueError, TypeError):
            continue
        for area_name, polygon in area_polygons.items():
            if polygon.contains(point):
                counts[area_name] = counts.get(area_name, 0) + 1
                matched += 1
                break

    print(f"  Matched {matched} {label} from datastore")
    return counts


def build_area_polygons() -> dict[str, Polygon | MultiPolygon]:
    """Load subzone GeoJSON and dissolve into planning area polygons."""
    with open(GEOJSON_PATH, encoding="utf-8") as f:
        geojson = json.load(f)

    from shapely.ops import unary_union

    area_geoms: dict[str, list[Polygon | MultiPolygon]] = {}
    for feature in geojson["features"]:
        area_name = feature["properties"].get("PLN_AREA_N", "").strip().upper()
        if not area_name:
            continue
        try:
            geom = shape(feature["geometry"])
            if area_name not in area_geoms:
                area_geoms[area_name] = []
            area_geoms[area_name].append(geom)
        except Exception:
            continue

    dissolved: dict[str, Polygon | MultiPolygon] = {}
    for area_name, geoms in area_geoms.items():
        dissolved[area_name] = unary_union(geoms)

    return dissolved


# ---------------------------------------------------------------------------
# Formatting
# ---------------------------------------------------------------------------

LABEL_CLEANUP = {
    # Age groups
    "age_group_total": "total",
    # Common prefixes to strip for readability
}


def clean_label(key: str) -> str:
    """Convert a raw API key into a human-readable label."""
    label = key.replace("_", " ").strip()
    # Remove common prefixes
    for prefix in ["hdb ", "total "]:
        if label.lower().startswith(prefix) and len(label) > len(prefix):
            label = label[len(prefix):]
    label = label.title()
    # Fix age ranges: "Age 55 59" -> "55-59"
    import re
    age_match = re.match(r"Age\s+(\d+)\s+(\d+)", label)
    if age_match:
        return f"{age_match.group(1)}-{age_match.group(2)}"
    age_match = re.match(r"Age\s+(\d+)\s+Over", label, re.IGNORECASE)
    if age_match:
        return f"{age_match.group(1)}+"
    return label


def format_number(n: int | float) -> str:
    """Format a number with commas and ~ prefix for estimates."""
    if isinstance(n, float):
        return f"~{int(n):,}"
    return f"~{n:,}"


def build_summary(
    planning_area: str,
    population: int,
    dominant_age: str,
    age_pct: float,
    dominant_ethnic: str,
    ethnic_pct: float,
    dominant_dwelling: str,
    dwelling_pct: float,
    median_income: str,
    primary_transport: str,
    transport_pct: float,
    owner_pct: float,
    median_hdb_4room: float | None,
    hawker_count: int,
    supermarket_count: int = 0,
    school_count: int = 0,
    clinic_count: int = 0,
) -> str:
    """Build a concise natural-language summary paragraph (~90 tokens)."""
    parts = [
        f"{planning_area.title()} has a population of {format_number(population)}.",
        f"The largest age group is {clean_label(dominant_age)} ({age_pct:.0f}%).",
        f"Ethnic mix: predominantly {clean_label(dominant_ethnic)} ({ethnic_pct:.0f}%).",
        f"Most common dwelling: {clean_label(dominant_dwelling)} ({dwelling_pct:.0f}%).",
        f"Median household income bracket: {clean_label(median_income)}.",
        f"Primary commute mode: {clean_label(primary_transport)} ({transport_pct:.0f}%).",
        f"{owner_pct:.0f}% are owner-occupiers.",
    ]
    if median_hdb_4room is not None:
        parts.append(f"A 4-room HDB flat resells for ~${median_hdb_4room:,.0f}.")
    amenities = []
    if hawker_count > 0:
        amenities.append(f"{hawker_count} hawker centres")
    if supermarket_count > 0:
        amenities.append(f"{supermarket_count} supermarkets")
    if school_count > 0:
        amenities.append(f"{school_count} schools")
    if clinic_count > 0:
        amenities.append(f"{clinic_count} clinics")
    if amenities:
        parts.append(f"Nearby amenities: {', '.join(amenities)}.")

    return " ".join(parts)


def compute_pct(data: list[dict[str, Any]], key: str, exclude_keys: set[str]) -> float:
    """Compute what percentage the dominant key represents of the total."""
    key_total = 0
    grand_total = 0
    for record in data:
        for k, v in record.items():
            if k.lower() in exclude_keys:
                continue
            try:
                num = int(v)
            except (ValueError, TypeError):
                continue
            grand_total += num
            if k == key:
                key_total += num
    if grand_total == 0:
        return 0.0
    return key_total / grand_total * 100


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

SKIP_KEYS = {"planning_area", "year", "gender"}


def main() -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    # Build planning area polygons for hawker point-in-polygon
    print("Building planning area polygons from subzone GeoJSON...")
    area_polygons = build_area_polygons()
    all_areas = sorted(area_polygons.keys())
    print(f"Found {len(all_areas)} planning areas")

    # Authenticate with OneMap
    print("Authenticating with OneMap...")
    token = get_onemap_token()
    print("  Authenticated successfully")

    # Fetch external data
    hdb_prices = fetch_hdb_resale_prices()
    hawker_counts = fetch_hawker_centres(area_polygons)
    supermarket_counts = count_amenity_geojson(SUPERMARKET_DATASET, "supermarkets", area_polygons)
    school_counts = count_amenity_geojson(SCHOOL_DATASET, "schools", area_polygons)
    clinic_counts = count_amenity_geojson(CLINIC_DATASET, "clinics/health facilities", area_polygons)

    # Process each planning area
    profiles: list[dict[str, Any]] = []

    for i, area in enumerate(all_areas):
        print(f"[{i + 1}/{len(all_areas)}] Processing {area}...")

        # Non-residential areas get a minimal profile
        if area in NON_RESIDENTIAL_AREAS:
            profiles.append({
                "planning_area": area,
                "population": 0,
                "dominant_age_group": "N/A",
                "dominant_ethnic_group": "N/A",
                "dominant_dwelling_type": "N/A",
                "median_income_bracket": "N/A",
                "primary_transport_mode": "N/A",
                "owner_occupier_pct": 0,
                "median_hdb_resale_4room": None,
                "hawker_centre_count": hawker_counts.get(area, 0),
                "supermarket_count": supermarket_counts.get(area, 0),
                "school_count": school_counts.get(area, 0),
                "clinic_count": clinic_counts.get(area, 0),
                "summary": f"{area.title()} is primarily a non-residential area.",
            })
            continue

        # Fetch all OneMap endpoints for this area
        age_data = fetch_onemap_data(token, ONEMAP_ENDPOINTS["age_group"], area)
        ethnic_data = fetch_onemap_data(token, ONEMAP_ENDPOINTS["ethnic_group"], area)
        income_data = fetch_onemap_data(token, ONEMAP_ENDPOINTS["income"], area)
        dwelling_data = fetch_onemap_data(token, ONEMAP_ENDPOINTS["dwelling"], area)
        transport_data = fetch_onemap_data(token, ONEMAP_ENDPOINTS["transport"], area)
        tenancy_data = fetch_onemap_data(token, ONEMAP_ENDPOINTS["tenancy"], area)

        # Compute stats
        population = get_total_population(age_data)

        dominant_age, _ = find_dominant(age_data, SKIP_KEYS | {"total"})
        age_pct = compute_pct(age_data, dominant_age, SKIP_KEYS | {"total"})

        dominant_ethnic, _ = find_dominant(ethnic_data, SKIP_KEYS | {"total"})
        ethnic_pct = compute_pct(ethnic_data, dominant_ethnic, SKIP_KEYS | {"total"})

        dominant_dwelling, _ = find_dominant(dwelling_data, SKIP_KEYS | {"total"})
        dwelling_pct = compute_pct(dwelling_data, dominant_dwelling, SKIP_KEYS | {"total"})

        median_income_key, _ = find_dominant(income_data, SKIP_KEYS | {"total", "no_working_person"})

        primary_transport, _ = find_dominant(transport_data, SKIP_KEYS | {"total"})
        transport_pct = compute_pct(transport_data, primary_transport, SKIP_KEYS | {"total"})

        owner_pct = compute_owner_occupier_pct(tenancy_data)

        # HDB price: match town name to planning area (they use same naming)
        hdb_price = hdb_prices.get(area)

        hawker_count = hawker_counts.get(area, 0)

        # If population is 0 from API but area is not in non-residential list,
        # still provide what data we have
        if population == 0:
            profiles.append({
                "planning_area": area,
                "population": 0,
                "dominant_age_group": dominant_age,
                "dominant_ethnic_group": dominant_ethnic,
                "dominant_dwelling_type": dominant_dwelling,
                "median_income_bracket": clean_label(median_income_key),
                "primary_transport_mode": primary_transport,
                "owner_occupier_pct": owner_pct,
                "median_hdb_resale_4room": hdb_price,
                "hawker_centre_count": hawker_count,
                "supermarket_count": supermarket_counts.get(area, 0),
                "school_count": school_counts.get(area, 0),
                "clinic_count": clinic_counts.get(area, 0),
                "summary": f"{area.title()} has limited residential population data available.",
            })
            continue

        supermarket_count = supermarket_counts.get(area, 0)
        school_count = school_counts.get(area, 0)
        clinic_count = clinic_counts.get(area, 0)

        summary = build_summary(
            planning_area=area,
            population=population,
            dominant_age=dominant_age,
            age_pct=age_pct,
            dominant_ethnic=dominant_ethnic,
            ethnic_pct=ethnic_pct,
            dominant_dwelling=dominant_dwelling,
            dwelling_pct=dwelling_pct,
            median_income=median_income_key,
            primary_transport=primary_transport,
            transport_pct=transport_pct,
            owner_pct=owner_pct,
            median_hdb_4room=hdb_price,
            hawker_count=hawker_count,
            supermarket_count=supermarket_count,
            school_count=school_count,
            clinic_count=clinic_count,
        )

        profiles.append({
            "planning_area": area,
            "population": population,
            "dominant_age_group": clean_label(dominant_age),
            "dominant_ethnic_group": clean_label(dominant_ethnic),
            "dominant_dwelling_type": clean_label(dominant_dwelling),
            "median_income_bracket": clean_label(median_income_key),
            "primary_transport_mode": clean_label(primary_transport),
            "owner_occupier_pct": owner_pct,
            "median_hdb_resale_4room": hdb_price,
            "hawker_centre_count": hawker_count,
            "supermarket_count": supermarket_count,
            "school_count": school_count,
            "clinic_count": clinic_count,
            "summary": summary,
        })

    # Write output
    with OUTPUT_PATH.open("w", encoding="utf-8") as f:
        json.dump(profiles, f, ensure_ascii=False, indent=2)

    print(f"\nWrote {len(profiles)} area profiles to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
