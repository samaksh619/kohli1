import { ScheduledEmailRow } from "@/types";
import StatusBadge from "./StatusBadge";

interface Props {
  rows: ScheduledEmailRow[];
  loading: boolean;
  mode: "scheduled" | "sent";
}

export default function EmailTable({ rows, loading, mode }: Props) {
  if (loading) {
    return (
      <div className="p-10 text-center text-slate-400 animate-pulse">Loading emails…</div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="p-16 text-center border border-dashed border-slate-300 rounded-xl">
        <p className="text-slate-500 font-medium">
          {mode === "scheduled" ? "No scheduled emails yet" : "No sent emails yet"}
        </p>
        <p className="text-slate-400 text-sm mt-1">
          {mode === "scheduled"
            ? "Compose a new email to schedule your first send."
            : "Once emails are sent they'll show up here."}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden border border-slate-200 rounded-xl bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-500 text-left">
          <tr>
            <th className="px-4 py-3 font-medium">Email</th>
            <th className="px-4 py-3 font-medium">Subject</th>
            <th className="px-4 py-3 font-medium">
              {mode === "scheduled" ? "Scheduled time" : "Sent time"}
            </th>
            <th className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-slate-100">
              <td className="px-4 py-3">{row.toEmail}</td>
              <td className="px-4 py-3 max-w-xs truncate">{row.subject}</td>
              <td className="px-4 py-3 text-slate-500">
                {mode === "scheduled"
                  ? new Date(row.scheduledFor).toLocaleString()
                  : row.sentAt
                  ? new Date(row.sentAt).toLocaleString()
                  : "—"}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={row.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
