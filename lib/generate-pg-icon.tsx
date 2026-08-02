import { ImageResponse } from "next/og";
import { getPgInfo } from "@/app/actions/settings";

export async function generatePgIcon(pixelSize: number) {
  const pgInfo = await getPgInfo();

  if (pgInfo.logoUrl) {
    const res = await fetch(pgInfo.logoUrl);
    const buffer = await res.arrayBuffer();
    return new Response(buffer, {
      headers: { "Content-Type": res.headers.get("content-type") || "image/png" },
    });
  }

  const initials = (pgInfo.shortName || "PG").toUpperCase();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#18181b",
          color: "#ffffff",
          fontSize: pixelSize * 0.4,
          fontWeight: 700,
          fontFamily: "sans-serif",
        }}
      >
        {initials}
      </div>
    ),
    { width: pixelSize, height: pixelSize }
  );
}
