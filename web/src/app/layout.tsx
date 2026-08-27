import type { Metadata, Viewport } from "next";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import LaunchGate from "@/components/LaunchGate";
import NativeAuthBridge from "@/components/NativeAuthBridge";
import RequireProfile from "@/components/RequireProfile";

export const metadata: Metadata = {
  title: "하비데이 HOBIDAY",
  description: "취미로 시작해서, 사람으로 끝나는 하루 — 볼더링 세션 매칭",
  // 홈 화면에 추가했을 때 주소창 없이 앱처럼 뜨게 한다
  appleWebApp: {
    title: "하비데이",
    capable: true,
    // black-translucent 는 콘텐츠를 상태바 아래로 밀지 않고 겹쳐 놔서
    // 로고가 시계와 부딪혔다. default 는 상태바 영역을 따로 확보하고
    // 밝은 배경 위에 검은 시계를 얹는다 — 라이트 UI 와 맞는 조합.
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
  // 아이폰 노치·홈바 영역까지 배경을 채운다
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-full">
        {/* 앱에서 소셜 로그인을 마치고 돌아오는 걸 받는다 (웹에서는 무동작) */}
        <NativeAuthBridge />
        {/* 오픈 전에는 잠긴 화면 진입을 홈(대기 화면)으로 돌려보낸다 */}
        <LaunchGate />
        {/* 상단은 노치, 하단은 홈바 + 네비 높이만큼 비운다 */}
        <div
          className="mx-auto max-w-md min-h-dvh"
          style={{
            paddingTop: "env(safe-area-inset-top)",
            paddingBottom: "calc(5rem + env(safe-area-inset-bottom))",
          }}
        >
          {/* 프로필이 없으면 어느 화면으로 들어와도 여기서 막힌다 */}
          <RequireProfile>{children}</RequireProfile>
        </div>
        <BottomNav />
      </body>
    </html>
  );
}
