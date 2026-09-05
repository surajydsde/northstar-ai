import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Northstar AI — AI-powered chat with memory and document search";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #0f172a 100%)",
          padding: "80px",
          fontFamily: "system-ui, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* subtle grid overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(rgba(99,102,241,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.07) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        {/* glow */}
        <div
          style={{
            position: "absolute",
            top: "-120px",
            right: "-120px",
            width: "600px",
            height: "600px",
            background: "radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)",
            borderRadius: "50%",
          }}
        />

        {/* logo badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "64px",
            height: "64px",
            background: "rgba(99,102,241,0.15)",
            border: "1.5px solid rgba(99,102,241,0.5)",
            borderRadius: "16px",
            marginBottom: "32px",
          }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L2 7l10 5 10-5-10-5z" fill="#818cf8" />
            <path d="M2 17l10 5 10-5" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" />
            <path d="M2 12l10 5 10-5" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>

        <h1
          style={{
            fontSize: "72px",
            fontWeight: 700,
            color: "#f8fafc",
            margin: "0 0 16px 0",
            lineHeight: 1.1,
            letterSpacing: "-2px",
          }}
        >
          Northstar AI
        </h1>

        <p
          style={{
            fontSize: "28px",
            color: "#94a3b8",
            margin: "0 0 48px 0",
            maxWidth: "720px",
            lineHeight: 1.4,
          }}
        >
          AI-powered chat with long-term memory, document search, and RAG
        </p>

        {/* pills */}
        <div style={{ display: "flex", gap: "16px" }}>
          {["Gemini", "pgvector", "Next.js 16"].map((label) => (
            <div
              key={label}
              style={{
                padding: "8px 20px",
                background: "rgba(99,102,241,0.12)",
                border: "1px solid rgba(99,102,241,0.3)",
                borderRadius: "9999px",
                color: "#a5b4fc",
                fontSize: "18px",
                fontWeight: 500,
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
