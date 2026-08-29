export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  me: () => request("/api/auth/me"),
  logout: () => request("/api/auth/logout", { method: "POST" }),
  scheduled: () => request("/api/emails/scheduled"),
  sent: () => request("/api/emails/sent"),
  parseLeads: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_BASE}/api/emails/leads/parse`, {
      method: "POST",
      credentials: "include",
      body: form,
    });
    if (!res.ok) throw new Error("Failed to parse leads file");
    return res.json() as Promise<{ count: number; emails: string[] }>;
  },
  schedule: (payload: {
    subject: string;
    body: string;
    emails: string[];
    startTime: string;
    minDelayMs?: number;
    hourlyLimit?: number;
  }) => request("/api/emails/schedule", { method: "POST", body: JSON.stringify(payload) }),
};

export function googleLoginUrl() {
  return `${API_BASE}/api/auth/google`;
}

export function slackConnectUrl() {
  return `${API_BASE}/api/slack/connect`;
}
