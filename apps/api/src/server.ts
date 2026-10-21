import { createApp } from './app.js';
import { env } from './config/env.js';
import { closePool } from './db/pool.js';
import { pingDatabase } from './repositories/health.repository.js';
import { logger } from './logger.js';

/**
 * Entry point: the only file that opens a real port.
 */
async function main() {
  // Refuse to start without a database (PRD §10). Better to fail loudly at boot
  // than to accept traffic and fail every request.
  if (!(await pingDatabase())) {
    logger.fatal('Cannot reach the database. Is it running? (docker compose up -d db)');
    process.exit(1);
  }

  const server = createApp().listen(env.PORT, () => {
    logger.info({ port: env.PORT }, `API listening on http://localhost:${env.PORT}/api/v1`);
  });

  /**
   * Graceful shutdown. When the platform stops us (SIGTERM on deploy) or you press Ctrl+C (SIGINT):
   * 1. stop accepting NEW connections, 2. let in-flight requests finish, 3. close DB connections.
   * Without this, a deploy could cut a request in half (e.g. mid-transaction).
   */
  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
    // Safety net: if something hangs, force exit after 10 s.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start');
  process.exit(1);
});
