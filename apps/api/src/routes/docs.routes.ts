import { createRequire } from 'node:module';
import path from 'node:path';
import { Router, type Router as ExpressRouter } from 'express';
import { env } from '../config/env.js';
import { buildOpenApiDocument } from '../docs/openapi.js';
import { AppError } from '../errors.js';

/**
 * API documentation (free and self-hosted, no outside service):
 *   GET /api/v1/openapi.json   the OpenAPI 3.1 description (machine-readable)
 *   GET /api/docs              Swagger UI (interactive page, "Try it out")
 *
 * Swagger UI's files come from the `swagger-ui-dist` package and are served by our own server.
 * The page loads ONLY same-origin files (no CDN, no inline script), so helmet's strict
 * Content-Security-Policy stays unchanged. Turn off with API_DOCS_ENABLED=false.
 */
const swaggerUiDir = path.dirname(createRequire(import.meta.url).resolve('swagger-ui-dist/package.json'));

const PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sewa Track API docs (demo)</title>
  <link rel="stylesheet" href="/api/docs/swagger-ui.css">
  <link rel="icon" type="image/png" href="/api/docs/favicon-32x32.png">
</head>
<body>
  <p style="margin:0;padding:8px 16px;background:#fff4d6;color:#4d3800;font:14px system-ui,sans-serif;text-align:center">
    Demo / portfolio project. Not affiliated with any government body. Do not enter real information.
  </p>
  <div id="swagger-ui"></div>
  <script src="/api/docs/swagger-ui-bundle.js"></script>
  <script src="/api/docs/init.js"></script>
</body>
</html>`;

// In a separate file (not inline) so the page works under helmet's "script-src 'self'" policy.
const INIT_SCRIPT = `window.ui = SwaggerUIBundle({
  url: '/api/v1/openapi.json',
  dom_id: '#swagger-ui',
  deepLinking: true,
  withCredentials: true,          // send the session cookie on "Try it out"
  persistAuthorization: true,
  tryItOutEnabled: true,
});`;

export function createDocsRouter(): ExpressRouter {
  const router = Router();
  if (!env.API_DOCS_ENABLED) return router;

  const spec = buildOpenApiDocument(env.APP_VERSION); // built once at startup

  router.get('/api/v1/openapi.json', (_req, res) => {
    res.json(spec);
  });
  router.get('/api/docs', (_req, res) => {
    res.type('html').send(PAGE);
  });
  router.get('/api/docs/init.js', (_req, res) => {
    res.type('application/javascript').send(INIT_SCRIPT);
  });
  // Serve ONLY the files the page needs (an allow-list), not the whole package folder,
  // so nothing else in it (e.g. the package's own demo page) is reachable.
  for (const file of ['swagger-ui.css', 'swagger-ui-bundle.js', 'favicon-32x32.png']) {
    router.get(`/api/docs/${file}`, (_req, res, next) => {
      // dotfiles: 'allow' because pnpm keeps packages under a ".pnpm" folder, which sendFile would
      // otherwise treat as hidden. Safe here: the file name comes from the fixed list above.
      res.sendFile(path.join(swaggerUiDir, file), { maxAge: '1d', dotfiles: 'allow' }, (err) => {
        if (err) next(new AppError('NOT_FOUND', 'File not found'));
      });
    });
  }
  return router;
}
