import { Worker, Job } from "bullmq";
import { connection } from "../lib/redis";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { EMAIL_QUEUE_NAME, enqueueScheduledEmail } from "./queue";
import { incrementAndCheckLimit, decrementLimit, waitForSenderSlot } from "./limiter";
import { sendMail } from "../services/mailer";
import { indexEmail } from "../services/elastic";
import { notifyRateLimitHit } from "../services/slack";

type JobData = { scheduledEmailId: string; senderId: string };

async function processJob(job: Job<JobData>) {
  const { scheduledEmailId, senderId } = job.data;

  // --- Idempotency guard -------------------------------------------------
  // The DB row is the source of truth. If this row is already 'sent' (e.g.
  // the process crashed right after sending but before acking the job),
  // we simply no-op instead of sending a duplicate email.
  const email = await prisma.scheduledEmail.findUnique({
    where: { id: scheduledEmailId },
    include: { sender: true, user: true },
  });
  if (!email) {
    console.warn(`[worker] scheduled email ${scheduledEmailId} no longer exists, skipping`);
    return;
  }
  if (email.status === "sent") {
    console.log(`[worker] ${scheduledEmailId} already sent, skipping (idempotent no-op)`);
    return;
  }

  // --- Hourly rate limit ---------------------------------------------------
  const cap = email.sender.maxPerHour || env.MAX_EMAILS_PER_HOUR_PER_SENDER;
  const { allowed, retryAt } = await incrementAndCheckLimit(senderId, cap);

  if (!allowed) {
    // Give the counter slot back since this job isn't actually consuming it.
    await decrementLimit(senderId);

    await prisma.scheduledEmail.update({
      where: { id: scheduledEmailId },
      data: { status: "rate_limited" },
    });

    await notifyRateLimitHit({
      userId: email.userId,
      senderEmail: email.sender.email,
      hourWindow: Math.floor(Date.now() / 3600000),
      cap,
    });

    // Reschedule into the next hour window, preserving relative order by
    // keeping the job's original priority/creation order via delay math.
    const delayMs = retryAt.getTime() - Date.now() + 1000; // +1s buffer past the boundary
    throw new RateLimitedError(delayMs);
  }

  // --- Per-sender minimum delay between sends -----------------------------
  const waitMs = await waitForSenderSlot(senderId);
  if (waitMs > 0) {
    await new Promise((res) => setTimeout(res, waitMs));
  }

  await prisma.scheduledEmail.update({
    where: { id: scheduledEmailId },
    data: { status: "processing", attempts: { increment: 1 } },
  });

  try {
    await sendMail(email.sender, {
      to: email.toEmail,
      subject: email.subject,
      html: email.body,
    });

    const sentAt = new Date();
    await prisma.scheduledEmail.update({
      where: { id: scheduledEmailId },
      data: { status: "sent", sentAt },
    });

    await indexEmail({
      id: email.id,
      toEmail: email.toEmail,
      subject: email.subject,
      body: email.body,
      status: "sent",
      userId: email.userId,
      senderId: email.senderId,
      scheduledFor: email.scheduledFor,
      sentAt,
    });
  } catch (err: any) {
    await prisma.scheduledEmail.update({
      where: { id: scheduledEmailId },
      data: { status: "failed", lastError: String(err?.message || err) },
    });
    throw err; // let BullMQ's retry/backoff handle transient SMTP failures
  }
}

/** Thrown to signal "not a failure, just needs to run again later". */
class RateLimitedError extends Error {
  delayMs: number;
  constructor(delayMs: number) {
    super("rate_limited");
    this.delayMs = delayMs;
  }
}

export const emailWorker = new Worker<JobData>(
  EMAIL_QUEUE_NAME,
  async (job) => {
    try {
      await processJob(job);
    } catch (err) {
      if (err instanceof RateLimitedError) {
        // Re-enqueue with the same deterministic jobId is not allowed while
        // the old job is still "active" in BullMQ, so instead we let this
        // attempt "fail" with a custom delay via moveToDelayed on retry —
        // simplest correct approach: schedule a fresh delayed job for the
        // same DB row (id) after removing this one, since idempotency is
        // keyed off the DB row + status, not the BullMQ job id.
        await job.remove();
        await enqueueScheduledEmail({
          scheduledEmailId: job.data.scheduledEmailId,
          senderId: job.data.senderId,
          runAt: new Date(Date.now() + err.delayMs),
        });
        return;
      }
      throw err;
    }
  },
  {
    connection,
    concurrency: env.WORKER_CONCURRENCY, // configurable via WORKER_CONCURRENCY env var
  }
);

emailWorker.on("completed", (job) => {
  console.log(`[worker] job ${job.id} completed`);
});
emailWorker.on("failed", (job, err) => {
  console.error(`[worker] job ${job?.id} failed:`, err.message);
});

console.log(
  `[worker] started with concurrency=${env.WORKER_CONCURRENCY}, min delay=${env.MIN_DELAY_BETWEEN_EMAILS_MS}ms`
);
