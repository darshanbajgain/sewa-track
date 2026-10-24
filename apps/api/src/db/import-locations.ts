import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * ONE-TIME data import: builds db/seed-data/locations.json from a public dataset.
 * Run with `pnpm --filter @sewa/api import:locations`. The output file is committed, so the seed
 * never needs the internet. Re-running gives the same file (the source commit is pinned).
 *
 * Source: https://github.com/sagautam5/local-states-nepal (MIT License, © 2020 Sagar Gautam)
 *
 * What we keep: ids, English + Nepali names, palika type, number of wards.
 * What we drop: website links, area and headquarters (not needed by this project).
 */

// Pinned commit: the data can't change under us, and the import is reproducible.
const SOURCE_COMMIT = '035cb3d2ce2420ad04d7aac1d0ce4d08960c57f0';
const BASE = `https://raw.githubusercontent.com/sagautam5/local-states-nepal/${SOURCE_COMMIT}/dataset`;
const OUTPUT = fileURLToPath(new URL('../../db/seed-data/locations.json', import.meta.url));

// Shapes of the source files (only the fields we use).
interface SrcProvince { id: number; name: string }
interface SrcDistrict { id: number; province_id: number; name: string }
interface SrcMunicipality { id: number; district_id: number; category_id: number; name: string; wards: string }

// Source category id → our LOCAL_LEVEL_TYPES value.
const TYPE_BY_CATEGORY: Record<number, string> = {
  1: 'METRO', // Metropolitan City
  2: 'SUB_METRO', // Sub-Metropolitan City
  3: 'MUNICIPALITY', // Municipality
  4: 'RURAL_MUNICIPALITY', // Rural Municipality
};

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/${path}`);
  if (!res.ok) throw new Error(`Download failed: ${path} (HTTP ${res.status})`);
  return (await res.json()) as T;
}

/**
 * Fix a known spelling problem in the source: "ा" + "े" typed as two signs instead of the
 * single vowel sign "ो" (e.g. "काेशी" → "कोशी"). They look alike but are different text,
 * so search and sorting would treat them as different words.
 */
function cleanNepali(name: string): string {
  return name.replaceAll('ाे', 'ो').normalize('NFC').trim();
}

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Data check failed: ${message}`);
}

async function main() {
  const [provEn, provNe, distEn, distNe, munEn, munNe] = await Promise.all([
    fetchJson<SrcProvince[]>('provinces/en.json'),
    fetchJson<SrcProvince[]>('provinces/np.json'),
    fetchJson<SrcDistrict[]>('districts/en.json'),
    fetchJson<SrcDistrict[]>('districts/np.json'),
    fetchJson<SrcMunicipality[]>('municipalities/en.json'),
    fetchJson<SrcMunicipality[]>('municipalities/np.json'),
  ]);

  // Nepali names are in separate files; look them up by id.
  const neName = (list: { id: number; name: string }[]) => new Map(list.map((x) => [x.id, cleanNepali(x.name)]));
  const provNeById = neName(provNe);
  const distNeById = neName(distNe);
  const munNeById = neName(munNe);

  const provinces = provEn.map((p) => ({ id: p.id, nameEn: p.name.trim(), nameNe: provNeById.get(p.id)! }));
  const districts = distEn.map((d) => ({
    id: d.id,
    provinceId: d.province_id,
    nameEn: d.name.trim(),
    nameNe: distNeById.get(d.id)!,
  }));
  const localLevels = munEn.map((m) => ({
    id: m.id,
    districtId: m.district_id,
    nameEn: m.name.trim(),
    nameNe: munNeById.get(m.id)!,
    type: TYPE_BY_CATEGORY[m.category_id]!,
    wards: Number(m.wards),
  }));

  // Check against official figures before writing anything.
  check(provinces.length === 7, 'expected 7 provinces');
  check(districts.length === 77, 'expected 77 districts');
  check(localLevels.length === 753, 'expected 753 local levels');
  check(localLevels.reduce((sum, l) => sum + l.wards, 0) === 6743, 'expected 6,743 wards in total');
  check([...provinces, ...districts, ...localLevels].every((x) => x.nameNe), 'every area needs a Nepali name');
  check(localLevels.every((l) => l.type), 'every local level needs a known type');
  check(localLevels.every((l) => Number.isInteger(l.wards) && l.wards > 0), 'ward counts must be positive integers');

  const output = {
    source: {
      name: 'local-states-nepal',
      url: 'https://github.com/sagautam5/local-states-nepal',
      commit: SOURCE_COMMIT,
      license: 'MIT, Copyright (c) 2020 Sagar Gautam',
    },
    provinces,
    districts,
    localLevels,
  };

  await writeFile(OUTPUT, JSON.stringify(output, null, 2) + '\n');
  console.log(
    `Wrote ${OUTPUT}: ${provinces.length} provinces, ${districts.length} districts, ${localLevels.length} local levels.`,
  );
}

await main();
