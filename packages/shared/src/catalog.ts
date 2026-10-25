import { z } from 'zod';
import type { LocalLevelType, ServiceTypeCode } from './enums.js';

/**
 * Public reference data (PRD F1, F2): service catalog and the location hierarchy.
 * Response types are shared so the web app knows exactly what the API returns.
 */

export interface RequiredDocument {
  nameEn: string;
  nameNe: string;
}

/** One service in the catalog. Fees and days are DEMO values (PRD §5). */
export interface ServiceTypeDto {
  code: ServiceTypeCode;
  nameEn: string;
  nameNe: string;
  feeNpr: number;
  serviceDays: number;
  requiresFieldVerification: boolean;
  requiredDocuments: RequiredDocument[];
}

export interface ProvinceDto {
  id: number;
  nameEn: string;
  nameNe: string;
}

export interface DistrictDto extends ProvinceDto {
  provinceId: number;
}

export interface LocalLevelDto extends ProvinceDto {
  districtId: number;
  type: LocalLevelType;
}

export interface WardDto {
  id: number;
  number: number;
}

/**
 * Query string rules for the cascading dropdowns: province → district → palika → ward.
 * Query values always arrive as text ("3"), so z.coerce turns them into numbers first.
 */
const positiveId = z.coerce.number().int().positive();

export const districtsQuerySchema = z.object({ provinceId: positiveId.optional() });
export const localLevelsQuerySchema = z.object({ districtId: positiveId });
export const wardsQuerySchema = z.object({ localLevelId: positiveId });
