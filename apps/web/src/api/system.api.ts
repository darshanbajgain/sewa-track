import { client } from './client';
import { ENDPOINTS } from './endpoints';

/**
 * Ask the API "are you running?". A sleeping free-tier API needs up to about a minute to start,
 * so this one call waits up to 90 s instead of the client's usual 15 s.
 */
export async function pingLive(signal: AbortSignal): Promise<void> {
  await client.get(ENDPOINTS.system.live, { timeout: 90_000, signal });
}
