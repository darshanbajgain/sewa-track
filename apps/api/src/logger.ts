import { pino } from 'pino';
import { env } from './config/env.js';

/**
 * One structured (JSON) logger for the whole API.
 *
 * JSON logs can be searched and filtered by field (e.g. requestId) in any log tool.
 * `redact` is a safety net: if someone ever logs an object containing these keys,
 * pino replaces the value with "[Redacted]" so passwords, tokens and applicant
 * details (PII) never reach the logs.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: ['password', '*.password', 'token', '*.token', 'applicant', '*.applicant', 'req.headers.cookie', 'req.headers.authorization'],
    censor: '[Redacted]',
  },
});
