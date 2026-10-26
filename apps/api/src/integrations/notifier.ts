import type { RequestStatus } from '@sewa/shared';
import { logger } from '../logger.js';

/**
 * Tells the citizen that their request changed (PRD F10).
 *
 * An INTERFACE, so the app doesn't care HOW the message is sent:
 *   ConsoleNotifier  → demo: writes a log line (no real SMS, PRD non-goal)
 *   FakeNotifier     → tests: records calls so a test can count them
 *   SmsNotifier      → a real deployment would call an SMS gateway (not built)
 * The app receives one through createApp(), which is "dependency injection".
 */
export interface StatusChangedMessage {
  trackingCode: string;
  fromStatus: RequestStatus;
  toStatus: RequestStatus;
}

export interface Notifier {
  statusChanged(message: StatusChangedMessage): Promise<void>;
}

export class ConsoleNotifier implements Notifier {
  async statusChanged(message: StatusChangedMessage): Promise<void> {
    // Only the code and statuses: no names, phone numbers or notes in logs (hard rule 5).
    logger.info({ notification: 'STATUS_CHANGED', ...message }, 'Notify citizen (demo: no SMS sent)');
  }
}
