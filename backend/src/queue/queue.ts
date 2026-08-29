import { Queue } from "bullmq";
import { connection } from "../lib/redis";

export const EMAIL_QUEUE_NAME = "email-send-queue";

export const emailQueue = new Queue(EMAIL_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    // Keep history bounded but don't wipe jobs instantly — useful for the
    // bull-board dashboard and for debugging failed sends.
    removeOnComplete: { count: 5000 },
    removeOnFail: { count: 5000 },
    attempts: 5,
    backoff: { type: "exponential", delay: 5000 },
  },
});

/**
 * Enqueue (or re-enqueue) a scheduled email.
 *
 * jobId is set to the ScheduledEmail row's own id. This is what gives us
 * idempotency: BullMQ refuses to create a second job with an id that
 * already exists in the queue (waiting/delayed/active), so calling this
 * again for the same row on every server boot is always safe.
 */
export async function enqueueScheduledEmail(params: {
  scheduledEmailId: string;
  senderId: string;
  runAt: Date;
}) {
  const delay = Math.max(0, params.runAt.getTime() - Date.now());
  await emailQueue.add(
    "send-email",
    { scheduledEmailId: params.scheduledEmailId, senderId: params.senderId },
    {
      jobId: params.scheduledEmailId,
      delay,
    }
  );
}
