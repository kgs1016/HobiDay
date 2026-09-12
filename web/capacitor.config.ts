import type { CapacitorConfig } from "@capacitor/cli";

/* 네이티브 셸 설정.
 *
 *  webDir 는 next build 가 내보낸 out/ 이다 (next.config.ts 의 output: 'export').
 *  server.url 로 배포된 웹을 띄우는 방법도 있지만 쓰지 않는다 — 웹뷰만 감싼
 *  앱은 애플 심사 4.2(최소 기능)에서 걸린다. 파일을 앱에 넣고, 푸시·카메라
 *  같은 네이티브 기능을 실제로 붙이는 쪽으로 간다.
 *
 *  ⚠️ appId 는 스토어에 한 번 올리면 바꿀 수 없다.
 */
const config: CapacitorConfig = {
  appId: "kr.hobiday.app",
  appName: "HOBIDAY", // 화면에 보이는 한글 이름은 네이티브 설정에서 따로 준다
  webDir: "out",
  plugins: { PushNotifications: { presentationOptions: ["sound", "banner", "list"] } },
};

export default config;
