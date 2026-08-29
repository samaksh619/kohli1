import { useState } from "react";
import { api } from "@/lib/api";

interface Props {
  onClose: () => void;
  onScheduled: () => void;
}

export default function ComposeModal({ onClose, onScheduled }: Props) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [startTime, setStartTime] = useState("");
  const [minDelayMs, setMinDelayMs] = useState(2000);
  const [hourlyLimit, setHourlyLimit] = useState(200);
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParsing(true);
    setError("");
    try {
      const result = await api.parseLeads(file);
      setEmails(result.emails);
    } catch (err: any) {
      setError(err.message || "Failed to parse file");
    } finally {
      setParsing(false);
    }
  }

  async function handleSubmit() {
    if (!subject || !body || emails.length === 0 || !startTime) {
      setError("Subject, body, a leads file, and start time are all required.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await api.schedule({
        subject,
        body,
        emails,
        startTime: new Date(startTime).toISOString(),
        minDelayMs,
        hourlyLimit,
      });
      onScheduled();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to schedule emails");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">Compose new email</h2>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Subject</label>
            <input
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Quick question about {{company}}"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">Body</label>
            <textarea
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm h-28"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Hi there, ..."
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">Leads file (CSV or text)</label>
            <input
              type="file"
              accept=".csv,.txt"
              onChange={handleFile}
              className="mt-1 w-full text-sm"
            />
            {parsing && <p className="text-xs text-slate-400 mt-1">Parsing {fileName}…</p>}
            {!parsing && emails.length > 0 && (
              <p className="text-xs text-green-600 mt-1">{emails.length} email addresses detected</p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-3">
              <label className="text-sm font-medium text-slate-700">Start time</label>
              <input
                type="datetime-local"
                className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Delay (ms)</label>
              <input
                type="number"
                className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={minDelayMs}
                onChange={(e) => setMinDelayMs(Number(e.target.value))}
              />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium text-slate-700">Hourly limit</label>
              <input
                type="number"
                className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={hourlyLimit}
                onChange={(e) => setHourlyLimit(Number(e.target.value))}
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-300">
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-4 py-2 text-sm rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? "Scheduling…" : "Schedule"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
