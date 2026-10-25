import type { DistrictDto, LocalLevelDto, ProvinceDto, WardDto } from '@sewa/shared';
import { pool } from '../db/pool.js';

/**
 * The location hierarchy for the cascading dropdowns. Every query filters by its parent id
 * through a $1 parameter, and orders results the way a person scans a list.
 */

export async function listProvinces(): Promise<ProvinceDto[]> {
  const { rows } = await pool.query<ProvinceDto>(
    `SELECT id, name_en AS "nameEn", name_ne AS "nameNe" FROM provinces ORDER BY id`, // official order 1–7
  );
  return rows;
}

/** All 77 districts, or only those of one province. */
export async function listDistricts(provinceId?: number): Promise<DistrictDto[]> {
  // "$1::smallint IS NULL OR province_id = $1": one query handles both cases. When no province is
  // given we pass NULL, the first part is true, and every district matches.
  const { rows } = await pool.query<DistrictDto>(
    `SELECT id, province_id AS "provinceId", name_en AS "nameEn", name_ne AS "nameNe"
     FROM districts
     WHERE $1::smallint IS NULL OR province_id = $1
     ORDER BY name_en`,
    [provinceId ?? null],
  );
  return rows;
}

export async function listLocalLevels(districtId: number): Promise<LocalLevelDto[]> {
  const { rows } = await pool.query<LocalLevelDto>(
    `SELECT id, district_id AS "districtId", name_en AS "nameEn", name_ne AS "nameNe", type
     FROM local_levels
     WHERE district_id = $1
     ORDER BY name_en`,
    [districtId],
  );
  return rows;
}

export async function listWards(localLevelId: number): Promise<WardDto[]> {
  const { rows } = await pool.query<WardDto>(
    `SELECT id, number FROM wards WHERE local_level_id = $1 ORDER BY number`, // Ward 1, 2, 3 … not 1, 10, 11
    [localLevelId],
  );
  return rows;
}

/** Does a row with this id exist? Used to tell "no results" apart from "unknown id". */
export async function exists(table: 'provinces' | 'districts' | 'local_levels', id: number): Promise<boolean> {
  // The table name can't be a $1 parameter (parameters are only for VALUES). It's safe here because
  // TypeScript only allows these three fixed names: an allow-list, never user input.
  const { rows } = await pool.query(`SELECT 1 FROM ${table} WHERE id = $1`, [id]);
  return rows.length > 0;
}
