# ReachInbox Email Job Scheduler

A production-style email scheduler: BullMQ + Redis for delayed-job scheduling
(no cron), MySQL via Prisma for the source of truth, Ethereal SMTP for
sending, Elasticsearch for search, a live BullMQ dashboard, Google login, and
a Next.js dashboard for composing and tracking sends.

## 1. Running it

### Prerequisites
Docker + Docker Compose, Node 18+.

### Infra
```bash
cd backend
docker compose up -d      # mysql, redis, elasticsearch
cp .env.example .env      # fill in GOOGLE_CLIENT_ID/SECRET, SLACK_* if you have them
npm install
npm run prisma:migrate    # creates tables
```

### Backend — two processes
```bash
npm run dev          # Express API on :4000 (also runs the boot reconciler)
npm run worker        # BullMQ worker, separate process/terminal
```
Live queue dashboard: **http://localhost:4000/admin/queues**

### Frontend
```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev            # http://localhost:3000
```

### Google OAuth
Create an OAuth Client ID in Google Cloud Console (Web application), set the
authorized redirect URI to `http://localhost:4000/api/auth/google/callback`,
and paste the client ID/secret into `backend/.env`.

### Slack app
Create a Slack app at api.slack.com/apps with the `incoming-webhook` and
`chat:write` scopes, redirect URI
`http://localhost:4000/api/slack/oauth/callback`, and paste the client
ID/secret into `backend/.env`. Click **Connect Slack** in the dashboard header
to run the real OAuth flow.

### Ethereal
Nothing to configure — the first time you schedule an email, the backend
auto-creates a throwaway Ethereal test account for you (`services/mailer.ts:
createEtherealAccount`) and reuses it for that user going forward. Sent-mail
preview links are returned by `sendMail()` and logged server-side.

## 2. Architecture

### Scheduling (no cron)
Every recipient becomes one `ScheduledEmail` row in MySQL — this table is
the **source of truth**, not BullMQ. When a batch is scheduled, each row is
also added to BullMQ as a **delayed job** (`queue.ts: enqueueScheduledEmail`)
whose `jobId` is set to the row's own UUID. That deterministic ID is what
gives us:

- **Idempotency** — adding a job with an ID that's already in the queue is a
  no-op in BullMQ, so re-running the enqueue logic (e.g. on every server
  boot) never creates duplicates. The worker also double-checks the DB row's
  `status` before sending, so even a theoretical duplicate job can't send
  the same email twice.
- **Restart persistence** — BullMQ jobs already live in Redis, so a plain
  Node process restart doesn't lose anything; the worker just resumes
  consuming the queue. To also survive a Redis restart/flush, `queue/
  reconcile.ts` runs once on API boot: it walks every DB row still in
  `scheduled` / `processing` / `rate_limited` status, checks whether BullMQ
  already has that job, and re-adds it if not — using the same deterministic
  ID, so it's always safe to run.

### Concurrency, delay, and rate limiting (`queue/worker.ts`, `queue/limiter.ts`)
- **Concurrency** is a single config value (`WORKER_CONCURRENCY`) passed to
  the BullMQ `Worker` — no custom pooling needed, BullMQ handles running N
  jobs in parallel safely.
- **Minimum delay between sends** is enforced *per sender* with a small Lua
  script (`limiter.ts: waitForSenderSlot`) that atomically reads-and-bumps a
  "next allowed send time" key in Redis. This is safe under concurrent
  workers because the read-modify-write happens as one atomic operation
  server-side, not as a race between separate GET/SET calls.
- **Hourly cap per sender** uses a fixed-window Redis counter
  (`rl:{senderId}:{hourBucket}`), incremented atomically with `INCR` and
  auto-expired. When a job would exceed the cap, it is **not** dropped: the
  worker throws a `RateLimitedError`, the counter slot is given back, the DB
  row is marked `rate_limited`, and a **new delayed job for the same row** is
  scheduled for the start of the next hour window — preserving the row
  (and therefore ordering intent) rather than failing it.
- **Trade-off**: the hourly limiter uses a fixed window, not a true sliding
  window, so in the worst case a sender could send close to 2x the cap
  across a window boundary. Documented here rather than solved with a more
  complex token-bucket, given assignment scope.

### Slack notification
`services/slack.ts` implements the real OAuth flow (`/api/slack/connect` →
Slack authorize screen → `/api/slack/oauth/callback` → token + webhook URL
stored per user). `notifyRateLimitHit` is called directly from the worker the
moment a cap is hit, posts to the stored **incoming webhook URL** (a genuine
HTTP call, not a log line), and de-dupes via a Redis flag keyed by
`(user, sender, hour)` so one burst of rejected jobs produces one Slack
message, not hundreds. If the user has never connected Slack, the function
returns early with no error and no crash; connecting later starts working on
the very next rate-limit event with no redeploy, since the lookup happens at
call time.

### Search (Elasticsearch)
Every send success indexes a document into an `emails` index
(`services/elastic.ts`). `GET /api/emails/search?q=...` does a multi-match
across subject/body/recipient, scoped to the logged-in user. Elasticsearch is
treated as optional infrastructure — indexing failures are caught and logged,
never allowed to fail an actual send.

### 1000+ emails at once
Scheduling a batch creates N DB rows and N BullMQ delayed jobs in a loop —
BullMQ/Redis comfortably queues tens of thousands of delayed jobs. Actual
throughput is governed entirely by `WORKER_CONCURRENCY` × the per-sender
delay/hourly-cap logic above, so a 1000-recipient batch scheduled "now" will
fan out over time rather than trying to send all 1000 in the same second.

## 3. Feature checklist

**Backend**
- [x] API-driven scheduling → BullMQ delayed jobs (no cron)
- [x] MySQL (Prisma) as source of truth for every scheduled/sent email
- [x] Multi-sender Ethereal SMTP sending
- [x] Elasticsearch indexing + search endpoint
- [x] Live BullMQ dashboard at `/admin/queues` (bull-board)
- [x] Restart persistence via deterministic job IDs + boot-time reconciler
- [x] Configurable worker concurrency
- [x] Configurable per-sender minimum delay (Redis-atomic)
- [x] Configurable, Redis-backed hourly rate limit per sender, reschedules
      instead of dropping on breach
- [x] Real Slack OAuth + live webhook call on rate-limit hit, silent no-op
      when disconnected
- [x] Idempotent sends (DB status check + deterministic job IDs)

**Frontend**
- [x] Real Google OAuth login, header shows name/email/avatar, logout
- [x] Scheduled / Sent tabs + Compose button
- [x] Compose modal: subject, body, CSV/text lead upload with detected-count,
      start time, delay, hourly limit
- [x] Scheduled & Sent tables with loading and empty states
- [x] Reusable table/badge/modal components, typed API layer

## 4. Assumptions & shortcuts

- A "sender" is auto-provisioned (a throwaway Ethereal account) the first
  time a user schedules an email, rather than building a full sender-
  management UI — the backend model (`Sender`) supports multiple real senders
  per user, but the frontend only exposes the one auto-created sender for
  this assignment.
- The compose modal spreads `scheduledFor` timestamps across recipients by
  the chosen delay so the dashboard reflects intent accurately, but the
  *actual* throttling guarantee comes from the worker's Redis-atomic
  per-sender delay — the two are deliberately decoupled.
- Fixed-window (not sliding-window) hourly rate limiting — see trade-off note
  above.
- No refresh-token/session-expiry UI beyond a basic cookie session.
