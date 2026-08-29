import dotenv from "dotenv";
dotenv.config();

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

export const env = {
  PORT: parseInt(process.env.PORT || "4000", 10),
  NODE_ENV: process.env.NODE_ENV || "development",
  SESSION_SECRET: required("SESSION_SECRET", "dev-secret-change-me"),

  DATABASE_URL: required("DATABASE_URL", "mysql://reachinbox:reachinbox@localhost:3306/reachinbox"),

  REDIS_HOST: process.env.REDIS_HOST || "localhost",
  REDIS_PORT: parseInt(process.env.REDIS_PORT || "6379", 10),

  ELASTICSEARCH_NODE: process.env.ELASTICSEARCH_NODE || "http://localhost:9200",
  ELASTIC_ENABLED: (process.env.ELASTIC_ENABLED || "true") === "true",

  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || "",
  GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL || "http://localhost:4000/api/auth/google/callback",

  SLACK_CLIENT_ID: process.env.SLACK_CLIENT_ID || "",
  SLACK_CLIENT_SECRET: process.env.SLACK_CLIENT_SECRET || "",
  SLACK_REDIRECT_URI: process.env.SLACK_REDIRECT_URI || "http://localhost:4000/api/slack/oauth/callback",

  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:3000",

  // Global default worker concurrency (can be overridden per deployment)
  WORKER_CONCURRENCY: parseInt(process.env.WORKER_CONCURRENCY || "5", 10),

  // Minimum delay enforced between two sends from the SAME sender, in ms.
  MIN_DELAY_BETWEEN_EMAILS_MS: parseInt(process.env.MIN_DELAY_BETWEEN_EMAILS_MS || "2000", 10),

  // Default hourly cap per sender, used when a Sender row doesn't override it.
  MAX_EMAILS_PER_HOUR_PER_SENDER: parseInt(process.env.MAX_EMAILS_PER_HOUR_PER_SENDER || "200", 10),

  // Ethereal test account (auto-created if left blank — see services/mailer.ts)
  ETHEREAL_USER: process.env.ETHEREAL_USER || "",
  ETHEREAL_PASS: process.env.ETHEREAL_PASS || "",
};
