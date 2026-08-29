import { EmailStatus } from "@/types";

const styles: Record<EmailStatus, string> = {
  scheduled: "bg-blue-50 text-blue-700 border-blue-200",
  processing: "bg-amber-50 text-amber-700 border-amber-200",
  sent: "bg-green-50 text-green-700 border-green-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  rate_limited: "bg-purple-50 text-purple-700 border-purple-200",
};

export default function StatusBadge({ status }: { status: EmailStatus }) {
  return (
    <span className={`text-xs font-medium px-2.5 py-1 rounded-full border capitalize ${styles[status]}`}>
      {status.replace("_", " ")}
    </span>
  );
}
