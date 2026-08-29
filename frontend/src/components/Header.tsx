import { CurrentUser } from "@/types";
import { api, slackConnectUrl } from "@/lib/api";
import { useRouter } from "next/router";

export default function Header({ user }: { user: CurrentUser }) {
  const router = useRouter();

  async function handleLogout() {
    await api.logout();
    router.push("/login");
  }

  return (
    <header className="flex items-center justify-between px-8 py-4 border-b border-slate-200 bg-white">
      <div className="font-semibold text-lg text-brand-700">ReachInbox Scheduler</div>
      <div className="flex items-center gap-4">
        {user.slackConnected ? (
          <span className="text-xs px-3 py-1.5 rounded-full bg-green-50 text-green-700 border border-green-200">
            Slack connected
          </span>
        ) : (
          <a
            href={slackConnectUrl()}
            className="text-xs px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200 transition"
          >
            Connect Slack
          </a>
        )}
        <div className="flex items-center gap-2">
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarUrl} alt={user.name} className="w-8 h-8 rounded-full" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-brand-500 text-white flex items-center justify-center text-sm">
              {user.name?.[0]}
            </div>
          )}
          <div className="text-sm leading-tight">
            <div className="font-medium">{user.name}</div>
            <div className="text-slate-500">{user.email}</div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 transition"
        >
          Logout
        </button>
      </div>
    </header>
  );
}
