import { ImageResponse } from "next/og";

// Imagen de compartir (Open Graph + Twitter) generada por Next — sin assets
// binarios. Next inyecta og:image y twitter:image automáticamente a partir de
// este archivo, así las tarjetas dejan de salir en blanco al compartir el link.
export const runtime = "nodejs";
export const alt =
  "OneMoment — La película de tu evento, hecha por la IA con las fotos de todos";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background:
            "radial-gradient(60% 55% at 50% 40%, rgba(198,161,91,0.14) 0%, #0b0a08 65%)",
          color: "#f2ede3",
          padding: 80,
          textAlign: "center",
          fontFamily: "serif",
        }}
      >
        <div
          style={{
            fontSize: 30,
            letterSpacing: 12,
            color: "#c6a15b",
            textTransform: "uppercase",
          }}
        >
          OneMoment
        </div>
        <div
          style={{
            width: 200,
            height: 1,
            margin: "36px 0",
            background: "rgba(242,237,227,0.25)",
          }}
        />
        <div style={{ display: "flex", fontSize: 68, fontWeight: 500, lineHeight: 1.1 }}>
          Tus invitados capturan.
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 68,
            fontWeight: 500,
            lineHeight: 1.1,
            color: "#c6a15b",
            fontStyle: "italic",
          }}
        >
          La IA crea la película.
        </div>
        <div style={{ marginTop: 40, fontSize: 28, color: "#9c948a" }}>
          Fotos y videos por QR · sin instalar apps · calidad original
        </div>
      </div>
    ),
    { ...size },
  );
}
