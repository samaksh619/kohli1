import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { getSlackAuthorizeUrl, handleSlackOAuthCallback, disconnectSlack } from "../services/slack";
import { env } from "../config/env";

export const slackRouter = Router();

slackRouter.get("/connect", requireAuth, (req, res) => {
  const url = getSlackAuthorizeUrl(req.session.userId!);
  res.redirect(url);
});

// Slack redirects the browser here after the user approves the app.
slackRouter.get("/oauth/callback", async (req, res) => {
  const { code, state } = req.query as { code?: string; state?: string };
  if (!code || !state) return res.redirect(`${env.FRONTEND_URL}/dashboard?slack=error`);
  try {
    await handleSlackOAuthCallback(code, state);
    res.redirect(`${env.FRONTEND_URL}/dashboard?slack=connected`);
  } catch (err) {
    console.error("[slack] oauth callback failed", err);
    res.redirect(`${env.FRONTEND_URL}/dashboard?slack=error`);
  }
});

slackRouter.post("/disconnect", requireAuth, async (req, res) => {
  await disconnectSlack(req.session.userId!);
  res.json({ ok: true });
});
