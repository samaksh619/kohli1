import express from "express";
import cors from "cors";
import session from "express-session";
import passport from "passport";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";

import { env } from "./config/env";
import { authRouter } from "./routes/auth";
import { slackRouter } from "./routes/slack";
import { emailsRouter } from "./routes/emails";
import { emailQueue } from "./queue/queue";
import { reconcileScheduledEmails } from "./queue/reconcile";
import { ensureIndex } from "./services/elastic";

const app = express();

app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(
  session({
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax", maxAge: 1000 * 60 * 60 * 24 * 7 },
  })
);
app.use(passport.initialize());

// --- Live BullMQ dashboard, required by the spec ("real-time queue visibility") ---
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");
createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter,
});
app.use("/admin/queues", serverAdapter.getRouter());

app.use("/api/auth", authRouter);
app.use("/api/slack", slackRouter);
app.use("/api/emails", emailsRouter);

app.get("/health", (_req, res) => res.json({ ok: true }));

async function main() {
  await ensureIndex();
  await reconcileScheduledEmails(); // re-attach any jobs missing from BullMQ after a restart
  app.listen(env.PORT, () => {
    console.log(`[api] listening on :${env.PORT}`);
    console.log(`[api] BullMQ dashboard: http://localhost:${env.PORT}/admin/queues`);
  });
}

main().catch((err) => {
  console.error("Fatal startup error", err);
  process.exit(1);
});
