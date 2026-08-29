import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import { api } from "@/lib/api";
import { CurrentUser, ScheduledEmailRow } from "@/types";
import Header from "@/components/Header";
import EmailTable from "@/components/EmailTable";
import ComposeModal from "@/components/ComposeModal";

type Tab = "scheduled" | "sent";

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [tab, setTab] = useState<Tab>("scheduled");
  const [rows, setRows] = useState<ScheduledEmailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompose, setShowCompose] = useState(false);

  useEffect(() => {
    api
      .me()
      .then((u) => setUser(u as CurrentUser))
      .catch(() => router.replace("/login"));
  }, [router]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const data = tab === "scheduled" ? await api.scheduled() : await api.sent();
      setRows(data as ScheduledEmailRow[]);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    if (user) loadRows();
  }, [user, loadRows]);

  // Light polling so newly-sent emails move tabs without a manual refresh.
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(loadRows, 8000);
    return () => clearInterval(interval);
  }, [user, loadRows]);

  if (!user) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading…</div>;
  }

  return (
    <div className="min-h-screen">
      <Header user={user} />

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            {(["scheduled", "sent"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-1.5 text-sm rounded-md font-medium transition ${
                  tab === t ? "bg-white shadow-sm text-brand-700" : "text-slate-500"
                }`}
              >
                {t === "scheduled" ? "Scheduled Emails" : "Sent Emails"}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowCompose(true)}
            className="px-4 py-2 text-sm rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition"
          >
            + Compose New Email
          </button>
        </div>

        <EmailTable rows={rows} loading={loading} mode={tab} />
      </main>

      {showCompose && (
        <ComposeModal onClose={() => setShowCompose(false)} onScheduled={loadRows} />
      )}
    </div>
  );
}
