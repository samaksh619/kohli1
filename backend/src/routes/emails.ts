import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { enqueueScheduledEmail } from "../queue/queue";
import { searchEmails } from "../services/elastic";
import { createEtherealAccount } from "../services/mailer";
import { env } from "../config/env";

export const emailsRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * Parses an uploaded CSV/text file of leads and returns the detected email
 * addresses (dedup'd), without persisting anything yet. The frontend calls
 * this first to show "N email addresses detected" before the user hits
 * Schedule.
 */
emailsRouter.post("/leads/parse", requireAuth, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const text = req.file.buffer.toString("utf-8");
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

  let addresses: string[] = [];
  try {
    // Try CSV first (handles a column named "email" or a bare single column).
    const records = parse(text, { columns: true, skip_empty_lines: true, relax_column_count: true });
    for (const row of records) {
      const emailCol = Object.keys(row).find((k) => k.toLowerCase().includes("email"));
      const val = emailCol ? row[emailCol] : Object.values(row)[0];
      if (typeof val === "string" && emailRegex.test(val)) addresses.push(val.trim());
    }
  } catch {
    // Fall back to plain-text regex scan (newline / comma separated list).
    addresses = text.match(emailRegex) || [];
  }

  const unique = Array.from(new Set(addresses.map((a) => a.toLowerCase())));
  res.json({ count: unique.length, emails: unique });
});

/**
 * Ensures the caller has at least one Sender to send from. For the
 * assignment/demo we auto-provision an Ethereal test sender on first use so
 * reviewers don't need to hand-configure SMTP creds before trying the flow.
 */
async function getOrCreateDefaultSender(userId: string) {
  const existing = await prisma.sender.findFirst({ where: { userId } });
  if (existing) return existing;

  const creds = await createEtherealAccount();
  return prisma.sender.create({
    data: {
      userId,
      name: "Ethereal Test Sender",
      email: creds.smtpUser,
      smtpHost: creds.smtpHost,
      smtpPort: creds.smtpPort,
      smtpUser: creds.smtpUser,
      smtpPass: creds.smtpPass,
      maxPerHour: env.MAX_EMAILS_PER_HOUR_PER_SENDER,
    },
  });
}

emailsRouter.post("/schedule", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const { subject, body, emails, startTime, minDelayMs, hourlyLimit } = req.body as {
    subject: string;
    body: string;
    emails: string[];
    startTime: string; // ISO string
    minDelayMs?: number;
    hourlyLimit?: number;
  };

  if (!subject || !body || !Array.isArray(emails) || emails.length === 0 || !startTime) {
    return res.status(400).json({ error: "subject, body, emails[], startTime are required" });
  }

  const sender = await getOrCreateDefaultSender(userId);
  if (hourlyLimit) {
    await prisma.sender.update({ where: { id: sender.id }, data: { maxPerHour: hourlyLimit } });
  }

  const baseTime = new Date(startTime);
  const delay = minDelayMs ?? env.MIN_DELAY_BETWEEN_EMAILS_MS;

  const created = [];
  for (let i = 0; i < emails.length; i++) {
    // Spread the *scheduledFor* timestamps out by the requested delay so the
    // dashboard shows a realistic per-recipient send time. The worker's own
    // per-sender throttle (limiter.ts) is the real enforcement mechanism;
    // this just makes "Scheduled Emails" reflect intent accurately.
    const scheduledFor = new Date(baseTime.getTime() + i * delay);

    const row = await prisma.scheduledEmail.create({
      data: {
        userId,
        senderId: sender.id,
        toEmail: emails[i],
        subject,
        body,
        scheduledFor,
        minDelayMs: delay,
        status: "scheduled",
      },
    });

    await enqueueScheduledEmail({
      scheduledEmailId: row.id,
      senderId: sender.id,
      runAt: scheduledFor,
    });

    created.push(row);
  }

  res.status(201).json({ scheduled: created.length });
});

emailsRouter.get("/scheduled", requireAuth, async (req, res) => {
  const rows = await prisma.scheduledEmail.findMany({
    where: { userId: req.session.userId!, status: { in: ["scheduled", "processing", "rate_limited"] } },
    orderBy: { scheduledFor: "asc" },
    take: 200,
  });
  res.json(rows);
});

emailsRouter.get("/sent", requireAuth, async (req, res) => {
  const rows = await prisma.scheduledEmail.findMany({
    where: { userId: req.session.userId!, status: { in: ["sent", "failed"] } },
    orderBy: { sentAt: "desc" },
    take: 200,
  });
  res.json(rows);
});

emailsRouter.get("/search", requireAuth, async (req, res) => {
  const q = (req.query.q as string) || "";
  const results = await searchEmails(req.session.userId!, q);
  res.json(results);
});
