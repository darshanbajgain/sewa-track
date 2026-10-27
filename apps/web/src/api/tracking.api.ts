import type { TrackingDto } from '@sewa/shared';
import { client } from './client';
import { ENDPOINTS } from './endpoints';

/** Public tracking by code (no login). The server normalizes the code (case, spaces, O→0, I/L→1). */
export async function trackRequest(code: string): Promise<TrackingDto> {
  const { data } = await client.get<{ tracking: TrackingDto }>(ENDPOINTS.tracking.byCode(code));
  return data.tracking;
}
