"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ResearchDetail } from "../../lib/optionsAnalysis/display";
import ResearchView from "./ResearchView";
import { fictionalExample } from "./exampleData";
import { Notice } from "./primitives";

type Issue = { path: string; message: string };

const FIELDS: { k: string; d: string }[] = [
  { k: "symbol", d: "1–5 capital letters." },
  { k: "underlying", d: "price, price_time (ISO time with zone) and price_time_kind: LAST_TRADE or QUOTE." },
  { k: "contracts", d: "Each option leg: contract_id, type, strike, expiry, bid, ask, quote_time (when the bid/ask was set, or null), iv, delta, open_interest, volume, multiplier, exercise_style, settlement." },
  { k: "bars", d: "Optional. Daily bars (date, open, high, low, close, volume) — needed for price-structure evidence." },
  { k: "levels", d: "Optional. support and resistance price lists. Derived from bars if omitted." },
  { k: "events", d: "covered_through (the date your event check covers, or null if unknown) and earnings_dates." },
];

export default function UserDataSection({ openSignal }: { openSignal: number }) {
  const [text, setText] = useState("");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResearchDetail | null>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const errId = useId();
  const helpId = useId();

  useEffect(() => {
    if (openSignal > 0 && detailsRef.current) {
      detailsRef.current.open = true;
      detailsRef.current.scrollIntoView({ block: "start" });
      areaRef.current?.focus({ preventScroll: true });
    }
  }, [openSignal]);

  async function analyze() {
    setStatus("working"); setIssues([]); setError(null); setResult(null);
    try {
      const res = await fetch("/api/market/options-engine/user-data", { method: "POST", headers: { "Content-Type": "application/json" }, body: text });
      const body = await res.json().catch(() => ({})) as { detail?: ResearchDetail; issues?: Issue[]; error?: string };
      if (res.ok && body.detail) { setResult(body.detail); setStatus("idle"); return; }
      if (body.issues?.length) { setIssues(body.issues); setStatus("error"); return; }
      setError(res.status === 429 ? "Too many requests. Try again in a minute." : res.status === 401 ? "Your session has ended. Sign in again." : `The service returned an error (${res.status}).`);
      setStatus("error");
    } catch {
      setError("Network error. Your data is still in the box.");
      setStatus("error");
    }
  }

  const invalid = status === "error" && (issues.length > 0 || !!error);

  return (
    <details ref={detailsRef} id="your-data" className="fn-details fn-surface">
      <summary style={{ fontSize: "var(--fn-fs-base)" }}>Analyze your own data (optional)</summary>
      <div className="space-y-4" style={{ marginTop: 8 }}>
        <p className="fn-text-2" style={{ fontSize: "var(--fn-fs-sm)" }}>
          If you have option quotes with the time each bid and ask was set, paste them here. The same rules and checks run on them.
          Your data is checked for internal consistency only — it is <strong>not independently verified</strong>, it isn&apos;t stored or shared, and any result stays paper only.
        </p>
        <div>
          <p className="fn-label">Accepted format</p>
          <p className="fn-meta" id={helpId}>One JSON object in the shape below. Broker CSV exports and screenshots are not supported.</p>
          <ul className="space-y-1" style={{ marginTop: 6, fontSize: "var(--fn-fs-sm)" }}>
            {FIELDS.map(f => <li key={f.k}><code className="fn-num fn-copper">{f.k}</code> <span className="fn-text-2">— {f.d}</span></li>)}
          </ul>
        </div>
        <div>
          <label htmlFor="fn-user-json" className="fn-label">Your data (JSON)</label>
          <textarea
            id="fn-user-json"
            ref={areaRef}
            className="fn-textarea"
            style={{ marginTop: 6 }}
            value={text}
            onChange={e => setText(e.target.value)}
            spellCheck={false}
            aria-invalid={invalid}
            aria-describedby={`${helpId}${invalid ? ` ${errId}` : ""}`}
            placeholder='{ "symbol": "…", "underlying": { … }, "contracts": [ … ], "events": { … } }'
          />
        </div>
        {invalid && (
          <div id={errId} role="alert">
            <Notice tone="error" title={issues.length ? `${issues.length} field${issues.length === 1 ? "" : "s"} need attention` : "Couldn't analyze"}>
              {error}
              {issues.length > 0 && (
                <ul className="space-y-1" style={{ marginTop: 4 }}>
                  {issues.map((i, n) => <li key={n}><code className="fn-num">{i.path}</code>: {i.message}</li>)}
                </ul>
              )}
            </Notice>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="fn-btn fn-btn-primary" onClick={analyze} disabled={!text.trim() || status === "working"}>
            {status === "working" ? "Analyzing…" : "Analyze my data"}
          </button>
          <button type="button" className="fn-btn" onClick={() => { setText(fictionalExample()); setIssues([]); setError(null); setStatus("idle"); }}>
            Load fictional example
          </button>
          <button type="button" className="fn-btn fn-btn-quiet" onClick={() => { setText(""); setIssues([]); setError(null); setResult(null); setStatus("idle"); }} disabled={!text && !result}>
            Clear
          </button>
        </div>
        <p className="fn-meta">The example uses an invented symbol (EXMPL) and invented prices. It is not market data.</p>
        {result && (
          <div style={{ marginTop: 8 }} aria-live="polite">
            <hr className="fn-divider" />
            <ResearchView detail={result} actions={{}} />
          </div>
        )}
      </div>
    </details>
  );
}
