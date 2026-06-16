import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt     = "Traxora AI — AI-Powered Smart Money Trading Signals";
export const size    = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width:         "100%",
          height:        "100%",
          display:       "flex",
          background:    "linear-gradient(135deg, #060a14 0%, #0d0b1a 60%, #060a14 100%)",
          fontFamily:    "system-ui, sans-serif",
          position:      "relative",
          overflow:      "hidden",
        }}
      >
        {/* Ambient glows */}
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 30% 50%, #10b98114 0%, transparent 55%), radial-gradient(circle at 80% 30%, #6366f10a 0%, transparent 45%)" }} />

        {/* Left panel */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "72px 60px 72px 80px" }}>
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "44px" }}>
            <div style={{ width: "44px", height: "44px", background: "#059669", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px" }}>
              📈
            </div>
            <span style={{ fontSize: "22px", fontWeight: 900, color: "#f1f5f9", letterSpacing: "-0.5px" }}>Traxora AI</span>
          </div>

          {/* Headline */}
          <div style={{ fontSize: "58px", fontWeight: 900, color: "#f1f5f9", letterSpacing: "-2px", lineHeight: 1.08, marginBottom: "22px" }}>
            Trade Like<br />
            <span style={{ color: "#10b981" }}>Smart Money.</span>
          </div>

          {/* Subtext */}
          <div style={{ fontSize: "20px", color: "#7b8db4", lineHeight: 1.5, marginBottom: "40px", maxWidth: "440px" }}>
            AI-powered BUY / SELL / HOLD signals with volume profile, options flow &amp; daily briefings.
          </div>

          {/* Price badge */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{ background: "#059669", borderRadius: "14px", padding: "14px 28px", fontSize: "22px", fontWeight: 900, color: "#ffffff" }}>
              $5 / mo
            </div>
            <div style={{ fontSize: "16px", color: "#4b5675", lineHeight: 1.5 }}>
              <div style={{ color: "#10b981", fontWeight: 700 }}>✓  No credit card to start</div>
              <div style={{ marginTop: "4px" }}>vs $29–$118/mo elsewhere</div>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ width: "1px", background: "linear-gradient(180deg, transparent, #252345 30%, #252345 70%, transparent)", margin: "60px 0" }} />

        {/* Right panel — signal card */}
        <div style={{ width: "420px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 50px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#4b5675", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "20px" }}>
            Live signal · demo
          </div>

          {/* Signal card */}
          <div style={{ background: "#13112a", border: "2px solid #10b98140", borderRadius: "22px", width: "100%", overflow: "hidden" }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "22px 24px 18px", borderBottom: "1px solid #252345" }}>
              <div>
                <div style={{ fontSize: "28px", fontWeight: 900, color: "#f1f5f9", letterSpacing: "-0.5px" }}>NVDA</div>
                <div style={{ fontSize: "13px", color: "#4b5675", marginTop: "2px" }}>NVIDIA Corp.</div>
              </div>
              <div style={{ background: "#10b98118", border: "1.5px solid #10b98155", borderRadius: "12px", padding: "10px 18px", fontSize: "20px", fontWeight: 900, color: "#10b981" }}>
                BUY
              </div>
            </div>

            {/* Rows */}
            <div style={{ padding: "18px 24px", display: "flex", flexDirection: "column", gap: "12px" }}>
              {[
                { l: "Order Block", v: "Bullish OB at $208.40" },
                { l: "Fair Value Gap", v: "FVG $209 – $211" },
                { l: "Kill Zone", v: "NY Session — Active" },
                { l: "Liquidity", v: "BSL at $220.50" },
              ].map(({ l, v }) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
                  <span style={{ color: "#4b5675" }}>{l}</span>
                  <span style={{ color: "#cbd5e1", fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 24px", borderTop: "1px solid #252345", background: "#0d0b1a60" }}>
              <div style={{ fontSize: "13px", color: "#4b5675" }}>Confidence: <span style={{ color: "#10b981", fontWeight: 700 }}>High</span></div>
              <div style={{ display: "flex", gap: "16px", fontSize: "13px" }}>
                <span style={{ color: "#4b5675" }}>Stop <span style={{ color: "#f43f5e", fontWeight: 700 }}>$198</span></span>
                <span style={{ color: "#4b5675" }}>R:R <span style={{ color: "#f1f5f9", fontWeight: 700 }}>2.3:1</span></span>
              </div>
            </div>
          </div>

          <div style={{ fontSize: "12px", color: "#333368", marginTop: "14px" }}>
            Powered by Claude Sonnet 4.6 · Not financial advice
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
