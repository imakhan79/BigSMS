import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/** Browser-tab icon: the orange Zicon "Z" on the maroon wordmark colour. */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#7A271D",
          borderRadius: 12,
          color: "#F0922B",
          fontSize: 48,
          fontWeight: 800,
          fontFamily: "sans-serif",
        }}
      >
        Z
      </div>
    ),
    size,
  );
}
