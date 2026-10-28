import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ONE-TIME data import: builds the district boundaries for the delay map
 * (apps/web/public/geo/nepal-districts.geojson). Run with `pnpm --filter @sewa/api import:district-map`.
 * The output is committed, so the app never downloads it from GitHub. Same pattern as import-locations.ts.
 *
 * Source: https://github.com/Acesmndr/nepal-geojson (MIT License, © 2018 Aashish Manandhar),
 * "lightweight" 77-district file. Chosen because it follows Nepal's official 2020 map (AGENTS §3.6):
 * checked by testing that Gunji, Kuti and Kalapani fall inside Darchula (see seed-data/README.md).
 *
 * What we keep: the shape, plus OUR district id (so the map joins directly to GET /stats/map areaId).
 * What we drop: the source's names, headquarters and province fields.
 */

const SOURCE_COMMIT = '0e084221686fba8a4a8c1590661367676e96e473';
const SOURCE_URL = `https://raw.githubusercontent.com/Acesmndr/nepal-geojson/${SOURCE_COMMIT}/generated-geojson/nepal-with-districts-acesmndr.geojson`;
const LOCATIONS = fileURLToPath(new URL('../../db/seed-data/locations.json', import.meta.url));
const OUTPUT = fileURLToPath(new URL('../../../web/public/geo/nepal-districts.geojson', import.meta.url));

// The two datasets spell 8 districts differently. Source spelling → our spelling (both compared lowercase).
const ALIASES: Record<string, string> = {
  achham: 'acham',
  dhanusa: 'dhanusha',
  kavrepalanchowk: 'kavrepalanchok',
  panchthar: 'pachthar',
  parbat: 'parwat',
  ramechhap: 'ramechap',
  tanahu: 'tanahun',
  tehrathum: 'terhathum',
};

type Position = number[];
type Geometry = { type: 'Polygon'; coordinates: Position[][] } | { type: 'MultiPolygon'; coordinates: Position[][][] };
interface SrcFeature { properties: { DISTRICT: string }; geometry: Geometry }

const normalize = (name: string) => name.toLowerCase().replace(/[^a-z]/g, '');

/**
 * 4 decimal places ≈ 11 m: far more detail than a country-wide map needs, and about half the file size.
 * Points that become equal after rounding are dropped.
 */
function roundRing(ring: Position[]): Position[] {
  const out: Position[] = [];
  for (const [lng, lat] of ring) {
    const point = [Math.round(lng! * 1e4) / 1e4, Math.round(lat! * 1e4) / 1e4];
    const last = out.at(-1);
    if (!last || last[0] !== point[0] || last[1] !== point[1]) out.push(point);
  }
  return out;
}

function roundGeometry(g: Geometry): Geometry {
  return g.type === 'Polygon'
    ? { type: 'Polygon', coordinates: g.coordinates.map(roundRing) }
    : { type: 'MultiPolygon', coordinates: g.coordinates.map((poly) => poly.map(roundRing)) };
}

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Data check failed: ${message}`);
}

async function main() {
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`);
  const source = (await res.json()) as { features: SrcFeature[] };

  const locations = JSON.parse(await readFile(LOCATIONS, 'utf8')) as { districts: { id: number; nameEn: string }[] };
  const idByName = new Map(locations.districts.map((d) => [normalize(d.nameEn), d.id]));

  const features = source.features.map((f) => {
    const name = normalize(f.properties.DISTRICT);
    const districtId = idByName.get(ALIASES[name] ?? name);
    check(districtId !== undefined, `no district in locations.json for "${f.properties.DISTRICT}"`);
    return { type: 'Feature', properties: { districtId }, geometry: roundGeometry(f.geometry) };
  });

  // Every one of our 77 districts must appear exactly once.
  const ids = new Set(features.map((f) => f.properties.districtId));
  check(features.length === 77 && ids.size === 77, `expected 77 unique districts, got ${features.length} / ${ids.size}`);

  const output = {
    type: 'FeatureCollection',
    // Credit travels with the file (MIT requires keeping the copyright notice).
    source: `Acesmndr/nepal-geojson@${SOURCE_COMMIT.slice(0, 7)}, MIT License, © 2018 Aashish Manandhar. Simplified; not survey-grade.`,
    features,
  };
  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(output));
  console.log(`Wrote ${features.length} districts to ${OUTPUT}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
