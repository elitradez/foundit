import { ImageResponse } from "next/og";

export const alt = "Foundit — University of Utah campus lost & found";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0c0c0c",
          padding: 56,
        }}
      >
        <div
          style={{
            width: 112,
            height: 112,
            borderRadius: 28,
            background: "#CC0000",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 36,
            boxShadow: "0 12px 40px rgba(204,0,0,0.35)",
          }}
        >
          <span style={{ color: "#ffffff", fontSize: 52, fontWeight: 700 }}>F</span>
        </div>
        <div
          style={{
            fontSize: 30,
            color: "#F5F5F0",
            letterSpacing: "0.35em",
            textTransform: "uppercase",
            fontWeight: 600,
            opacity: 0.85,
            marginBottom: 16,
          }}
        >
          Foundit
        </div>
        <div
          style={{
            fontSize: 58,
            fontWeight: 700,
            color: "#CC0000",
            textAlign: "center",
            lineHeight: 1.1,
            maxWidth: 980,
          }}
        >
          University of Utah
        </div>
        <div
          style={{
            fontSize: 26,
            color: "#F5F5F0",
            opacity: 0.55,
            marginTop: 28,
            textAlign: "center",
          }}
        >
          Campus lost and found
        </div>
      </div>
    ),
    { ...size },
  );
}
