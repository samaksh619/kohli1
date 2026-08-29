import { prisma } from "../lib/prisma";
import { emailQueue, enqueueScheduledEmail } from "./queue";

/**
 * Restart-survival strategy
 * -------------------------
 * BullMQ jobs already live in Redis, so a plain Node process restart alone
 * does NOT lose them — the worker just resumes consuming the same queue.
 *
 * This reconciler covers the harder case: Redis itself was flushed/restarted
 * without AOF/RDB persistence (or the DB and queue drifted for any reason).
 * On every API boot we walk every DB row still in `scheduled` or
 * `rate_limited` status and re-add it to BullMQ using its own id as the
 * BullMQ jobId. Because jobId is deterministic, calling add() again for a
 * job that already exists in the queue is a safe no-op (BullMQ ignores it),
 * so this function is idempotent and cheap to run on every boot.
 */
export async function reconcileScheduledEmails() {
  const pending = await prisma.scheduledEmail.findMany({
    where: { status: { in: ["scheduled", "rate_limited", "processing"] } },
  });

  let requeued = 0;
  for (const row of pending) {
    const existingJob = await emailQueue.getJob(row.id);
    if (existingJob) continue; // already tracked in BullMQ, nothing to do

    // `processing` rows mean we crashed mid-send with no confirmation the
    // email actually went out — Ethereal/most SMTP sends are effectively
    // atomic per-call, so we conservatively treat them as not-yet-sent and
    // requeue; the idempotency check in the worker still guards against a
    // true duplicate if it turns out it *had* completed.
    await prisma.scheduledEmail.update({
      where: { id: row.id },
      data: { status: "scheduled" },
    });

    await enqueueScheduledEmail({
      scheduledEmailId: row.id,
      senderId: row.senderId,
      runAt: row.scheduledFor,
    });
    requeued++;
  }

  console.log(`[reconcile] re-enqueued ${requeued}/${pending.length} pending emails on boot`);
}
