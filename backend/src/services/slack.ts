import axios from "axios";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import { env } from "../config/env";

export function getSlackAuthorizeUrl(userId: string) {
  const params = new URLSearchParams({
    client_id: env.SLACK_CLIENT_ID,
    scope: "incoming-webhook,chat:write",
    redirect_uri: env.SLACK_REDIRECT_URI,
    state: userId, // ties the callback back to the logged-in user (CSRF-safe: signed session cookie also checked)
  });
  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

export async function handleSlackOAuthCallback(code: string, userId: string) {
  const resp = await axios.post(
    "https://slack.com/api/oauth.v2.access",
    null,
    {
      params: {
        client_id: env.SLACK_CLIENT_ID,
        client_secret: env.SLACK_CLIENT_SECRET,
        code,
        redirect_uri: env.SLACK_REDIRECT_URI,
      },
    }
  );

  const data = resp.data;
  if (!data.ok) {
    throw new Error(`Slack OAuth failed: ${data.error}`);
  }

  await prisma.slackIntegration.upsert({
    where: { userId },
    update: {
      accessToken: data.access_token,
      teamName: data.team?.name || "unknown",
      channelId: data.incoming_webhook?.channel_id || null,
      webhookUrl: data.incoming_webhook?.url || null,
    },
    create: {
      userId,
      accessToken: data.access_token,
      teamName: data.team?.name || "unknown",
      channelId: data.incoming_webhook?.channel_id || null,
      webhookUrl: data.incoming_webhook?.url || null,
    },
  });
}

export async function disconnectSlack(userId: string) {
  await prisma.slackIntegration.deleteMany({ where: { userId } });
}

/**
 * Sends a live Slack message the moment a sender's hourly rate limit is
 * hit. De-duplicated per (sender, hour-window) so a burst of rejected jobs
 * doesn't spam the channel with one message per email.
 */
export async function notifyRateLimitHit(params: {
  userId: string;
  senderEmail: string;
  hourWindow: number;
  cap: number;
}) {
  const dedupeKey = `slack-notified:${params.userId}:${params.senderEmail}:${params.hourWindow}`;
  const firstTime = await redis.set(dedupeKey, "1", "EX", 3600, "NX");
  if (!firstTime) return; // already notified for this sender+hour

  const integration = await prisma.slackIntegration.findUnique({
    where: { userId: params.userId },
  });
  if (!integration || !integration.webhookUrl) {
    // Not connected — per spec, fail silently, no crash.
    return;
  }

  await axios.post(integration.webhookUrl, {
    text: `⚠️ *Rate limit hit* for sender \`${params.senderEmail}\`. Hourly cap of ${params.cap} emails reached — remaining jobs are being pushed to the next hour window automatically.`,
  });
}
