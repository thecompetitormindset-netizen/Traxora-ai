"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#0D0B1A", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "sans-serif" }}>
        <div style={{ textAlign: "center", color: "#F1F5F9", maxWidth: 360, padding: "0 24px" }}>
          <div style={{ width: 48, height: 48, background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.25)", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F43F5E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <p style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Something went wrong</p>
          <p style={{ fontSize: 13, color: "#4B5675", marginBottom: 4 }}>A critical error occurred. Your data is safe.</p>
          {error.digest && (
            <p style={{ fontSize: 11, color: "#333368", marginBottom: 20, fontFamily: "monospace" }}>ref: {error.digest}</p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{ background: "#059669", color: "#fff", border: "none", borderRadius: 12, padding: "10px 28px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
