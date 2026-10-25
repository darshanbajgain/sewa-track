import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closePool } from '../src/db/pool.js';

// Public reference endpoints, against the seeded test database (no login needed).
const app = createApp();
afterAll(() => closePool());

describe('GET /service-types', () => {
  it('returns the 5 services with demo fees, days and bilingual document lists', async () => {
    const res = await request(app).get('/api/v1/service-types');

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
    expect(res.body.serviceTypes).toHaveLength(5);
    expect(res.body.serviceTypes).toContainEqual(
      expect.objectContaining({
        code: 'LAND_BOUNDARY',
        nameNe: 'चार किल्ला प्रमाणित',
        feeNpr: 500,
        serviceDays: 3,
        requiresFieldVerification: true,
        requiredDocuments: expect.arrayContaining([expect.objectContaining({ nameEn: 'Land ownership certificate' })]),
      }),
    );
  });
});

describe('location dropdowns: province → district → palika → ward', () => {
  it('lists the 7 provinces in official order', async () => {
    const res = await request(app).get('/api/v1/locations/provinces');
    expect(res.status).toBe(200);
    expect(res.body.provinces.map((p: { id: number }) => p.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(res.body.provinces[0]).toEqual({ id: 1, nameEn: 'Koshi Province', nameNe: 'कोशी प्रदेश' });
  });

  it('lists all 77 districts without a filter, and 13 for Bagmati Province', async () => {
    const all = await request(app).get('/api/v1/locations/districts');
    const bagmati = await request(app).get('/api/v1/locations/districts?provinceId=3');

    expect(all.body.districts).toHaveLength(77);
    expect(bagmati.body.districts).toHaveLength(13);
    expect(bagmati.body.districts).toContainEqual(expect.objectContaining({ nameEn: 'Kathmandu', provinceId: 3 }));
  });

  it('lists the palikas of Kathmandu district, including the metropolitan city', async () => {
    const districts = await request(app).get('/api/v1/locations/districts?provinceId=3');
    const kathmandu = districts.body.districts.find((d: { nameEn: string }) => d.nameEn === 'Kathmandu');

    const res = await request(app).get(`/api/v1/locations/local-levels?districtId=${kathmandu.id}`);
    expect(res.status).toBe(200);
    expect(res.body.localLevels).toContainEqual(
      expect.objectContaining({ id: 307, nameEn: 'Kathmandu', type: 'METRO', districtId: kathmandu.id }),
    );
  });

  it('lists wards 1..32 of Kathmandu Metropolitan City in number order', async () => {
    const res = await request(app).get('/api/v1/locations/wards?localLevelId=307');
    expect(res.status).toBe(200);
    expect(res.body.wards.map((w: { number: number }) => w.number)).toEqual(Array.from({ length: 32 }, (_, i) => i + 1));
  });
});

describe('query validation', () => {
  it.each([
    ['missing required id', '/api/v1/locations/wards'],
    ['not a number', '/api/v1/locations/local-levels?districtId=abc'],
    ['negative', '/api/v1/locations/districts?provinceId=-1'],
    ['decimal', '/api/v1/locations/wards?localLevelId=3.5'],
    ['SQL text', "/api/v1/locations/wards?localLevelId=1%20OR%201=1"],
  ])('returns 400 for %s', async (_label, url) => {
    const res = await request(app).get(url);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it.each([
    ['province', '/api/v1/locations/districts?provinceId=99', 'Province not found'],
    ['district', '/api/v1/locations/local-levels?districtId=9999', 'District not found'],
    ['palika', '/api/v1/locations/wards?localLevelId=999999', 'Local level not found'],
  ])('returns 404 for an unknown %s (not an empty list)', async (_label, url, message) => {
    const res = await request(app).get(url);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND', message });
  });
});
