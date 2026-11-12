import { createMockApp } from './app.js';

/** Entry point: the only file that opens a real port (tests use createMockApp directly). */
const port = Number(process.env.PORT ?? 4100);

const server = createMockApp().listen(port, () => {
  console.log(`Mock National ID service listening on http://localhost:${port}`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
