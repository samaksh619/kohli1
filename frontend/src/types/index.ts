export type EmailStatus = "scheduled" | "processing" | "sent" | "failed" | "rate_limited";

export interface ScheduledEmailRow {
  id: string;
  toEmail: string;
  subject: string;
  scheduledFor: string;
  status: EmailStatus;
  sentAt: string | null;
  lastError: string | null;
}

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  slackConnected: boolean;
}
