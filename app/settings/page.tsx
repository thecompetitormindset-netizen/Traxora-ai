"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import { resetPortfolio } from "../lib/trading";
import { scopedKey } from "../lib/userState";
import { getTheme, setTheme, type Theme } from "../lib/theme";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-[#4B5675] mb-3">{title}</p>
      <div className="bg-[#0C1017] border border-[#1C2333] rounded-2xl overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  sublabel,
  value,
  danger,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  value?: React.ReactNode;
  danger?: boolean;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`w-full flex items-center gap-4 px-5 py-4 border-b border-[#1C2333] last:border-0 transition-colors text-left ${
        onClick
          ? danger
            ? "hover:bg-rose-500/5 cursor-pointer"
            : "hover:bg-[#111827] cursor-pointer"
          : ""
      }`}
    >
      <span className={`shrink-0 ${danger ? "text-rose-400" : "text-[#4B5675]"}`}>{icon}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${danger ? "text-rose-400" : "text-[#F1F5F9]"}`}>{label}</p>
        {sublabel && <p className="text-xs text-[#4B5675] mt-0.5">{sublabel}</p>}
      </div>
      {value && <div className="shrink-0">{value}</div>}
      {onClick && !danger && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4B5675" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      )}
    </Tag>
  );
}

function Badge({ children, color = "default" }: { children: React.ReactNode; color?: "green" | "emerald" | "amber" | "default" }) {
  const styles = {
    green:   "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    emerald:  "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    amber:   "bg-amber-500/10 text-amber-400 border-amber-500/20",
    default: "bg-[#111827] text-[#7B8DB4] border-[#1C2333]",
  };
  return (
    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border ${styles[color]}`}>
      {children}
    </span>
  );
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">("default");
  const [resetInput, setResetInput] = useState("");
  const [theme, setThemeState] = useState<Theme>("dark");
  const [resetDone, setResetDone] = useState(false);
  const [alertCount, setAlertCount] = useState(0);


  // Email subscription state
  const [subscribed,   setSubscribed]   = useState(false);
  const [subEmail,     setSubEmail]     = useState<string | null>(null);
  const [subscribing,  setSubscribing]  = useState(false);
  const [subMsg,       setSubMsg]       = useState<{ ok: boolean; text: string } | null>(null);
  const [testStatus,   setTestStatus]   = useState<"idle" | "sending" | "sent" | string>("idle");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setThemeState(getTheme());
    if (!("Notification" in window)) {
      setNotifPermission("unsupported");
    } else {
      setNotifPermission(Notification.permission);
    }
    const raw = localStorage.getItem(scopedKey("traxora_alerts"));
    try { setAlertCount(raw ? JSON.parse(raw).length : 0); } catch { /* ignore */ }

    // Load email subscription status
    fetch("/api/settings/email")
      .then(r => r.json())
      .then(d => { setSubscribed(!!d.subscribed); setSubEmail(d.subscribedEmail ?? null); })
      .catch(() => {/* ignore */});

  }, []);

  async function enableNotifications() {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setNotifPermission(result);
  }

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  }

  function clearAlerts() {
    localStorage.removeItem(scopedKey("traxora_alerts"));
    setAlertCount(0);
  }

  function handleReset() {
    if (resetInput !== "RESET") return;
    resetPortfolio();
    setResetInput("");
    setResetDone(true);
    setTimeout(() => setResetDone(false), 3000);
  }


  async function subscribe() {
    setSubscribing(true);
    setSubMsg(null);
    try {
      const res = await fetch("/api/settings/email", { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setSubMsg({ ok: false, text: data.error || "Failed" }); return; }
      setSubscribed(true);
      setSubEmail(data.email);
      setSubMsg({ ok: true, text: "Subscribed! You'll get the morning brief weekdays at 7:30 AM MT." });
    } catch {
      setSubMsg({ ok: false, text: "Network error — try again" });
    } finally {
      setSubscribing(false);
    }
  }

  async function unsubscribe() {
    setSubscribing(true);
    setSubMsg(null);
    try {
      await fetch("/api/settings/email", { method: "DELETE" });
      setSubscribed(false);
      setSubMsg({ ok: true, text: "Unsubscribed." });
    } catch {
      setSubMsg({ ok: false, text: "Network error — try again" });
    } finally {
      setSubscribing(false);
    }
  }

  async function sendTestEmail() {
    setTestStatus("sending");
    try {
      const res = await fetch("/api/settings/test-email", { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setTestStatus(data.error || "Failed — check env vars"); return; }
      setTestStatus("sent");
      setTimeout(() => setTestStatus("idle"), 5000);
    } catch {
      setTestStatus("Network error");
    }
  }

  return (
    <div className="flex min-h-screen text-[#F1F5F9]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 p-4 sm:p-6 xl:p-8 pb-28">
          <div className="max-w-2xl mx-auto w-full">

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-black tracking-tight">Settings</h1>
            <p className="text-sm text-[#7B8DB4] mt-1">Manage your account, alerts, and preferences.</p>
          </div>

          <div className="space-y-6">

            {/* Profile */}
            <Section title="Account">
              {session?.user ? (
                <>
                  <div className="flex items-center gap-4 px-5 py-5 border-b border-[#1C2333]">
                    {session.user.image ? (
                      <img src={session.user.image} alt="Avatar" className="w-12 h-12 rounded-xl object-cover shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-emerald-600 flex items-center justify-center text-lg font-bold shrink-0">
                        {session.user.name?.[0] ?? "U"}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-[#F1F5F9] truncate">{session.user.name ?? "—"}</p>
                      <p className="text-sm text-[#7B8DB4] truncate mt-0.5">{session.user.email ?? "—"}</p>
                    </div>
                    <Badge color="green">Signed in</Badge>
                  </div>
                  <Row
                    icon={
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                    }
                    label="Sign out"
                    sublabel="You'll need to sign in again to access your dashboard"
                    danger
                    onClick={() => signOut({ callbackUrl: "/login" })}
                  />
                </>
              ) : (
                <Row
                  icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                      <polyline points="10 17 15 12 10 7" />
                      <line x1="15" y1="12" x2="3" y2="12" />
                    </svg>
                  }
                  label="Sign in with Google"
                  sublabel="Connect your Google account to save your data"
                  onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
                />
              )}
            </Section>

            {/* Notifications */}
            <Section title="Signal Alerts">
              <Row
                icon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                }
                label="Push notifications"
                sublabel="Get alerted the moment a BUY or SELL signal fires"
                value={
                  notifPermission === "granted" ? (
                    <Badge color="green">Active</Badge>
                  ) : notifPermission === "denied" ? (
                    <Badge color="amber">Blocked</Badge>
                  ) : notifPermission === "unsupported" ? (
                    <Badge>Unsupported</Badge>
                  ) : (
                    <Badge color="emerald">Off</Badge>
                  )
                }
                onClick={notifPermission === "default" ? enableNotifications : undefined}
              />
              <Row
                icon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14H6L5 6" />
                    <path d="M10 11v6M14 11v6" />
                    <path d="M9 6V4h6v2" />
                  </svg>
                }
                label="Clear alert history"
                sublabel={alertCount > 0 ? `${alertCount} alerts stored locally` : "No alerts stored"}
                onClick={alertCount > 0 ? clearAlerts : undefined}
              />
              {notifPermission === "denied" && (
                <div className="px-5 py-3 bg-amber-500/5 border-t border-[#1C2333]">
                  <p className="text-xs text-amber-400 leading-relaxed">
                    Notifications are blocked by your browser. Go to <strong>browser Settings → Site permissions → Notifications</strong> and allow this site.
                  </p>
                </div>
              )}
            </Section>

            {/* Daily Morning Brief */}
            <Section title="Daily Morning Brief">
              <div className="px-5 py-5 border-b border-[#1C2333]">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 text-base">
                    🌅
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[#F1F5F9] text-sm">Daily email brief</p>
                    <p className="text-xs text-[#4B5675] mt-0.5">
                      Top 10 ICT opportunities delivered to your Google account email every weekday at{" "}
                      <span className="text-emerald-400 font-medium">7:30 AM Mountain Time</span>
                    </p>
                  </div>
                  {subscribed && <Badge color="green">Active</Badge>}
                </div>

                {/* Show the email that will be used */}
                {subEmail && (
                  <div className="flex items-center gap-2 bg-[#060A14]/60 border border-[#1C2333] rounded-xl px-3.5 py-2.5 mb-4">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4B5675" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                      <polyline points="22,6 12,13 2,6"/>
                    </svg>
                    <span className="text-sm text-[#F1F5F9] font-medium">{subEmail}</span>
                    <span className="text-xs text-[#4B5675] ml-1">from your Google account</span>
                  </div>
                )}

                {subMsg && (
                  <p className={`text-xs mb-3 ${subMsg.ok ? "text-emerald-400" : "text-rose-400"}`}>{subMsg.text}</p>
                )}

                <div className="flex items-center gap-3 flex-wrap">
                  {!subscribed ? (
                    <button
                      type="button"
                      onClick={subscribe}
                      disabled={subscribing}
                      className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-colors px-4 py-2.5 rounded-xl text-sm font-bold"
                    >
                      {subscribing ? "Subscribing…" : "Subscribe"}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={sendTestEmail}
                        disabled={testStatus === "sending"}
                        className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-colors px-4 py-2.5 rounded-xl text-sm font-bold"
                      >
                        {testStatus === "sending" ? "Sending…" : testStatus === "sent" ? "✓ Email sent!" : "Send Daily Email"}
                      </button>
                      <button
                        type="button"
                        onClick={unsubscribe}
                        disabled={subscribing}
                        className="text-sm text-[#4B5675] hover:text-rose-400 transition-colors"
                      >
                        Unsubscribe
                      </button>
                    </>
                  )}
                  {testStatus !== "idle" && testStatus !== "sending" && testStatus !== "sent" && (
                    <p className="text-xs text-rose-400">{testStatus}</p>
                  )}
                </div>
              </div>

            </Section>

            {/* PWA */}
            <Section title="Install App">
              <Row
                icon={<span className="text-base">📱</span>}
                label="Add to home screen"
                sublabel="iPhone: Share → Add to Home Screen · Android: browser menu → Install App"
                value={<Badge color="emerald">PWA</Badge>}
              />
              <Row
                icon={<span className="text-base">🤖</span>}
                label="Use alongside Robinhood"
                sublabel="Traxora fires signals → you execute trades on Robinhood"
              />
            </Section>

            {/* Preferences */}
            <Section title="Preferences">
              <Row
                icon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="5" />
                    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                  </svg>
                }
                label="Theme"
                sublabel={theme === "light" ? "Soft light — low contrast" : "Dark navy"}
                value={
                  <div className={`relative w-10 h-5 rounded-full transition-colors ${theme === "light" ? "bg-emerald-500" : "bg-[#1E2D4A]"}`} >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${theme === "light" ? "left-5" : "left-0.5"}`} />
                  </div>
                }
                onClick={toggleTheme}
              />
              <Row
                icon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="1" x2="12" y2="23" />
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                  </svg>
                }
                label="Currency"
                sublabel="All prices displayed in US dollars"
                value={<Badge>USD</Badge>}
              />
              <Row
                icon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                }
                label="AI model"
                sublabel="Signals powered by Claude Opus 4.7 with ICT Smart Money"
                value={<Badge color="emerald">Opus 4.7</Badge>}
              />
            </Section>

            {/* About */}
            <Section title="About">
              <Row
                icon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                }
                label="Traxora AI"
                sublabel="Version 1.0.0 · Not financial advice"
                value={<Badge color="green">Live</Badge>}
              />
            </Section>


            {/* Danger zone */}
            <Section title="Danger Zone">
              <div className="px-5 py-5">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#F43F5E" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.51"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-rose-400">Reset paper portfolio</p>
                    <p className="text-xs text-[#4B5675] mt-0.5">
                      Permanently wipes all trades and holdings. Restarts with ${(10000).toLocaleString()} virtual cash. This cannot be undone.
                    </p>
                  </div>
                </div>
                <label className="text-[11px] text-[#4B5675] font-medium uppercase tracking-wide block mb-2">
                  Type <span className="text-rose-400 font-bold">RESET</span> to confirm
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={resetInput}
                    onChange={(e) => setResetInput(e.target.value.toUpperCase())}
                    placeholder="RESET"
                    className="flex-1 bg-[#060A14]/80 border border-[#1C2333] focus:border-rose-500/50 rounded-xl px-3.5 py-2.5 text-sm text-[#F1F5F9] outline-none placeholder:text-[#4B5675] transition-colors font-mono tracking-widest"
                  />
                  <button
                    type="button"
                    onClick={handleReset}
                    disabled={resetInput !== "RESET"}
                    className="bg-rose-600 hover:bg-rose-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors px-4 py-2.5 rounded-xl text-sm font-bold"
                  >
                    Reset
                  </button>
                </div>
                {resetDone && (
                  <p className="text-xs text-emerald-400 mt-2">Portfolio reset to $10,000 ✓</p>
                )}
              </div>
            </Section>

          </div>
          </div>
        </main>
      </div>
    </div>
  );
}
