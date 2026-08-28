import { ImageResponse } from "next/og";

/* 홈 화면 아이콘. 이미지 파일을 두지 않고 빌드 때 PNG 로 생성한다.
   180x180 은 iOS 홈 화면 아이콘 권장 크기다. */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// output: 'export' 에서는 빌드 때 한 번 만들어 파일로 떨군다
export const dynamic = "force-static";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#5ba7f7",
          color: "#ffffff",
          fontSize: 74,
          fontWeight: 800,
          letterSpacing: 2,
        }}
      >
        <div>H</div>
        <div style={{ fontSize: 20, color: "#eef6ff", letterSpacing: 3 }}>
          HOBIDAY
        </div>
      </div>
    ),
    { ...size }
  );
}
