import IORedis from "ioredis";
import { env } from "../config/env";

// BullMQ requires maxRetriesPerRequest: null on the connection it's given.
export const connection = new IORedis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  maxRetriesPerRequest: null,
});

// A second, plain-purpose client for our own rate-limit counters /
// idempotency flags, kept separate from the BullMQ connection so BullMQ's
// blocking commands never contend with our counter reads/writes.
export const redis = new IORedis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  maxRetriesPerRequest: null,
});
