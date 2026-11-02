/**
 * District boundaries for the delay map: a static file in public/geo/ (built by
 * apps/api/src/db/import-district-map.ts), served by Next.js itself, not by the API. So a plain fetch,
 * not the axios client (whose baseURL is /api/v1).
 */
export interface DistrictFeature {
  type: 'Feature';
  properties: { districtId: number };
  geometry: { type: 'Polygon'; coordinates: number[][][] } | { type: 'MultiPolygon'; coordinates: number[][][][] };
}
export interface DistrictShapes {
  type: 'FeatureCollection';
  features: DistrictFeature[];
}

export async function getDistrictShapes(): Promise<DistrictShapes> {
  const res = await fetch('/geo/nepal-districts.geojson');
  if (!res.ok) throw new Error(`Could not load the map (HTTP ${res.status})`);
  return (await res.json()) as DistrictShapes;
}
