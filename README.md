# ReachInbox

ReachInbox is a full-stack email scheduling and tracking application built with a Node.js + TypeScript backend and a Next.js frontend. It lets users authenticate with Google, create email campaigns, schedule delivery, monitor queue status, and search sent mail records.

## Features

- Google OAuth login and session-based authentication
- Compose email campaigns with subject, body, and recipient list upload
- Schedule delivery using delayed jobs with Redis and BullMQ
- Track scheduled and sent emails in a dashboard UI
- Enforce per-sender delay and hourly rate limits
- Reconcile scheduled jobs on server startup
- Search message records using Elasticsearch
- Real Slack OAuth integration for rate-limit notifications
- BullMQ admin dashboard for monitoring jobs

## Tech stack

- Frontend: Next.js, React, TypeScript, Tailwind CSS
- Backend: Node.js, Express, TypeScript, Prisma, MySQL
- Job processing: BullMQ + Redis
- Search: Elasticsearch
- Auth: Passport + Google OAuth
- Infra: Docker Compose

## Prerequisites

- Node.js 18 or later
- Docker and Docker Compose
- Git

## Project structure

- backend: API server, Prisma models, BullMQ workers, Redis and queue logic
- frontend: Next.js dashboard and auth UI
- README.md: project overview and setup instructions

## Local setup

### 1. Start infrastructure

From the project root:

```bash
cd backend
docker compose up -d
```

This starts:

- MySQL on port 3306
- Redis on port 6379
- Elasticsearch on port 9200

### 2. Configure backend environment

Create a backend/.env file with values similar to:

```env
PORT=4000
SESSION_SECRET=your-session-secret
DATABASE_URL=mysql://reachinbox:reachinbox@localhost:3306/reachinbox
REDIS_HOST=localhost
REDIS_PORT=6379
ELASTICSEARCH_NODE=http://localhost:9200
ELASTIC_ENABLED=true
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:4000/api/auth/google/callback
SLACK_CLIENT_ID=your-slack-client-id
SLACK_CLIENT_SECRET=your-slack-client-secret
SLACK_REDIRECT_URI=http://localhost:4000/api/slack/oauth/callback
FRONTEND_URL=http://localhost:3000
WORKER_CONCURRENCY=5
MIN_DELAY_BETWEEN_EMAILS_MS=2000
MAX_EMAILS_PER_HOUR_PER_SENDER=200
```

### 3. Install dependencies and run database migrations

```bash
cd backend
npm install
npx prisma generate
npm run prisma:migrate
```

### 4. Start backend services

Open two terminals:

```bash
cd backend
npm run dev
```

```bash
cd backend
npm run worker
```

The API runs on http://localhost:4000 and the BullMQ dashboard is available at http://localhost:4000/admin/queues.

### 5. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

The app runs on http://localhost:3000.

## Google OAuth setup

1. Go to the Google Cloud Console.
2. Create a new OAuth client ID.
3. Add the redirect URI:
   http://localhost:4000/api/auth/google/callback
4. Add the generated client ID and secret to backend/.env.

## Slack setup

1. Create a Slack app in the Slack API dashboard.
2. Add the incoming webhook and chat:write permissions.
3. Set the redirect URI to:
   http://localhost:4000/api/slack/oauth/callback
4. Add the client ID and secret to backend/.env.

## Common commands

Backend:

```bash
cd backend
npm run dev
npm run worker
npm run build
```

Frontend:

```bash
cd frontend
npm run dev
npm run build
npm run lint
```

## Notes

- The backend uses Prisma with MySQL as the source of truth for scheduled jobs.
- Redis and BullMQ power the delayed job flow and worker processing.
- Elasticsearch is used for search indexing and query operations.
- The project is designed for local development and assignment-style demo execution.

## License

This project is provided as-is for educational and assignment use.
