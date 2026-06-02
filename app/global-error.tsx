"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#0D0B1A", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center", color: "#F1F5F9", fontFamily: "sans-serif" }}>
          <p style={{ fontSize: 14, color: "#4B5675", marginBottom: 16 }}>A critical error occurred.</p>
          <button
            type="button"
            onClick={reset}
            style={{ background: "#059669", color: "#fff", border: "none", borderRadius: 12, padding: "10px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
