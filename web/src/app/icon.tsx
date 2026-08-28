import { ImageResponse } from "next/og";

/* 브라우저 탭 파비콘 */
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// output: 'export' 에서는 빌드 때 한 번 만들어 파일로 떨군다
export const dynamic = "force-static";

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
          background: "#5ba7f7",
          color: "#ffffff",
          fontSize: 22,
          fontWeight: 800,
        }}
      >
        H
      </div>
    ),
    { ...size }
  );
}
