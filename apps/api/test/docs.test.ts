import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closePool } from '../src/db/pool.js';

const app = createApp();
afterAll(() => closePool());

type Spec = {
  openapi: string;
  paths: Record<string, Record<string, { responses: Record<string, unknown>; security?: unknown[] }>>;
  components: { schemas: Record<string, unknown> };
};

async function getSpec(): Promise<Spec> {
  const res = await request(app).get('/api/v1/openapi.json');
  expect(res.status).toBe(200);
  return res.body;
}

/** Every "METHOD /path" Express actually serves, walking the router tree (Express 5). */
function expressRoutes(): string[] {
  const out: string[] = [];
  const walk = (stack: { route?: { path: string; methods: Record<string, boolean> }; handle?: { stack?: unknown[] } }[]) => {
    for (const layer of stack) {
      if (layer.route) {
        for (const method of Object.keys(layer.route.methods)) out.push(`${method.toUpperCase()} ${layer.route.path}`);
      } else if (layer.handle?.stack) {
        walk(layer.handle.stack as never);
      }
    }
  };
  walk((app as unknown as { router: { stack: never } }).router.stack);
  return out;
}

describe('OpenAPI spec', () => {
  it('is OpenAPI 3.1 with the demo disclaimer', async () => {
    const spec = await getSpec();
    expect(spec.openapi).toBe('3.1.0');
    expect(JSON.stringify(spec)).toContain('Not affiliated with any government body');
  });

  it('documents EVERY API route Express serves (docs cannot fall behind the code)', async () => {
    const spec = await getSpec();
    const documented = new Set(
      Object.entries(spec.paths).flatMap(([path, ops]) =>
        Object.keys(ops).map((m) => `${m.toUpperCase()} ${path.replace(/\{(\w+)\}/g, ':$1')}`),
      ),
    );
    // API routes are registered inside the /api/v1 router (paths without the prefix); the docs routes themselves are not API routes.
    const served = expressRoutes()
      .filter((r) => !r.includes(' /api/'))
      .map((r) => r.replace(' /', ' /api/v1/'));

    expect(served.length).toBeGreaterThanOrEqual(18);
    expect(served.filter((r) => !documented.has(r))).toEqual([]); // undocumented routes
    expect([...documented].filter((r) => !served.includes(r))).toEqual([]); // documented routes that don't exist
  });

  it('has no broken $ref links', async () => {
    const spec = await getSpec();
    const refs = [...JSON.stringify(spec).matchAll(/"\$ref":"#\/components\/schemas\/(\w+)"/g)].map((m) => m[1]!);
    expect(refs.length).toBeGreaterThan(20);
    expect(refs.filter((name) => !(name in spec.components.schemas))).toEqual([]);
  });

  it('marks protected operations with cookie auth and documents their 401', async () => {
    const spec = await getSpec();
    for (const [path, ops] of Object.entries(spec.paths)) {
      for (const [method, op] of Object.entries(ops)) {
        if (op.security) expect(op.responses, `${method} ${path}`).toHaveProperty('401');
      }
    }
    expect(spec.paths['/api/v1/requests/{id}/transitions']!.post!.responses).toHaveProperty('409');
  });

  it('takes input rules from the same Zod schemas the API validates with', async () => {
    const spec = await getSpec();
    const login = (spec.paths['/api/v1/auth/login']!.post as unknown as { requestBody: { content: Record<string, { schema: { properties: { phone: { pattern: string } } } }> } }).requestBody;
    expect(login.content['application/json']!.schema.properties.phone.pattern).toBe('^\\d{10}$');
  });
});

describe('Swagger UI page', () => {
  it('serves the page and its two files from our own server under the strict CSP', async () => {
    const page = await request(app).get('/api/docs');
    expect(page.status).toBe(200);
    expect(page.text).toContain('/api/docs/swagger-ui-bundle.js');
    expect(page.text).toContain('Demo / portfolio project');
    expect(page.headers['content-security-policy']).toContain("script-src 'self'");
    expect(page.headers['content-security-policy']).not.toContain('unsafe-eval');

    expect((await request(app).get('/api/docs/swagger-ui-bundle.js')).status).toBe(200);
    expect((await request(app).get('/api/docs/swagger-ui.css')).status).toBe(200);
    expect((await request(app).get('/api/docs/init.js')).text).toContain("url: '/api/v1/openapi.json'");
  });

  it('does not expose any other file of the swagger-ui-dist package', async () => {
    expect((await request(app).get('/api/docs/index.html')).status).toBe(404);
    expect((await request(app).get('/api/docs/package.json')).status).toBe(404);
  });
});
