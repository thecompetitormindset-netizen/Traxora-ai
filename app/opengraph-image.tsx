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
          width:      "100%",
          height:     "100%",
          display:    "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #060a14 0%, #0d0b1a 50%, #060a14 100%)",
          fontFamily: "system-ui, sans-serif",
          position:   "relative",
          overflow:   "hidden",
        }}
      >
        {/* Subtle grid */}
        <div
          style={{
            position:  "absolute",
            inset:     0,
            backgroundImage: "radial-gradient(circle at 25% 25%, #10b98112 0%, transparent 50%), radial-gradient(circle at 75% 75%, #6366f112 0%, transparent 50%)",
          }}
        />

        {/* Logo pill */}
        <div
          style={{
            display:       "flex",
            alignItems:    "center",
            gap:           "14px",
            background:    "#13112a",
            border:        "1px solid #252345",
            borderRadius:  "20px",
            padding:       "14px 24px",
            marginBottom:  "40px",
          }}
        >
          <div
            style={{
              width:          "44px",
              height:         "44px",
              background:     "#059669",
              borderRadius:   "12px",
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              fontSize:       "22px",
            }}
          >
            📈
          </div>
          <span style={{ fontSize: "22px", fontWeight: 900, color: "#f1f5f9", letterSpacing: "-0.5px" }}>
            Traxora AI
          </span>
        </div>

        {/* Headline */}
        <div
          style={{
            fontSize:      "62px",
            fontWeight:    900,
            color:         "#f1f5f9",
            letterSpacing: "-2px",
            lineHeight:    1.1,
            textAlign:     "center",
            maxWidth:      "860px",
            marginBottom:  "20px",
          }}
        >
          Trade Like Smart Money.
        </div>

        {/* Sub */}
        <div
          style={{
            fontSize:    "24px",
            color:       "#7b8db4",
            textAlign:   "center",
            maxWidth:    "700px",
            lineHeight:  1.5,
            marginBottom: "44px",
          }}
        >
          AI-powered BUY / SELL / HOLD signals with volume profile, options flow, and morning briefings.
        </div>

        {/* Feature pills */}
        <div style={{ display: "flex", gap: "14px" }}>
          {["Smart Money Analysis", "Options Flow", "AI Journal", "$5 / mo"].map((label, i) => (
            <div
              key={i}
              style={{
                background:   i === 3 ? "#059669" : "#13112a",
                border:       `1px solid ${i === 3 ? "#059669" : "#252345"}`,
                borderRadius: "12px",
                padding:      "10px 20px",
                fontSize:     "16px",
                fontWeight:   700,
                color:        i === 3 ? "#ffffff" : "#7b8db4",
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
