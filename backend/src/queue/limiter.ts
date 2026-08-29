import { redis } from "../lib/redis";
import { env } from "../config/env";

/**
 * Rate limiting strategy
 * ----------------------
 * We bucket time into fixed 1-hour windows: `hour_window = floor(now / 3600s)`.
 * Each sender gets a Redis key `rl:{senderId}:{hour_window}` that we INCR.
 * The key is given a 2-hour TTL so it self-cleans even if we crash before
 * ever reading it again.
 *
 * This is safe across multiple worker processes/instances because Redis
 * INCR is atomic — two workers racing to send for the same sender in the
 * same hour will still get a strictly increasing, correct count.
 *
 * Trade-off: this is a *fixed* window, not a true sliding window, so a
 * burst can send up to 2x the cap across a window boundary (e.g. 200 at
 * 12:59 and 200 more at 13:00). For an assignment-scale system this is an
 * accepted, documented trade-off — a token-bucket in Redis (via a Lua
 * script) would be the production-grade fix.
 */

function hourWindow(date = new Date()): number {
  return Math.floor(date.getTime() / (60 * 60 * 1000));
}

function rateKey(senderId: string, window = hourWindow()): string {
  return `rl:${senderId}:${window}`;
}

export async function incrementAndCheckLimit(
  senderId: string,
  maxPerHour: number
): Promise<{ allowed: boolean; count: number; retryAt: Date }> {
  const window = hourWindow();
  const key = rateKey(senderId, window);
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, 60 * 60 * 2);
  }
  const nextWindowStartMs = (window + 1) * 60 * 60 * 1000;
  return {
    allowed: count <= maxPerHour,
    count,
    retryAt: new Date(nextWindowStartMs),
  };
}

/** Called when a job gets rejected by the limiter, to give the slot back. */
export async function decrementLimit(senderId: string) {
  const key = rateKey(senderId);
  await redis.decr(key);
}

/**
 * Minimum delay between sends, enforced per-sender (not globally), so
 * multiple senders can send concurrently but a single sender is throttled
 * to mimic real provider limits. Implemented as a Redis key holding the
 * timestamp of the next allowed send for that sender.
 */
export async function waitForSenderSlot(senderId: string): Promise<number> {
  const key = `next-send:${senderId}`;
  const minDelay = env.MIN_DELAY_BETWEEN_EMAILS_MS;
  const now = Date.now();

  // Atomically reserve the next slot: read-and-bump in one round trip using
  // a small Lua script so two workers can't both grab the same slot.
  const script = `
    local key = KEYS[1]
    local now = tonumber(ARGV[1])
    local minDelay = tonumber(ARGV[2])
    local nextAllowed = tonumber(redis.call('GET', key) or "0")
    local start = math.max(now, nextAllowed)
    redis.call('SET', key, start + minDelay, 'PX', 60000)
    return start
  `;
  const reservedStart = (await redis.eval(script, 1, key, now, minDelay)) as number;
  const waitMs = Math.max(0, reservedStart - now);
  return waitMs;
}

export function currentHourWindow() {
  return hourWindow();
}
