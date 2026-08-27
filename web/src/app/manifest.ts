import type { MetadataRoute } from "next";

/* 홈 화면에 추가하면 주소창 없는 전체화면으로 뜨게 하는 설정.
   앱스토어 배포 없이 아이폰·안드로이드에서 앱처럼 쓰기 위한 최소 구성. */

// output: 'export' 는 요청마다 만드는 응답을 못 낸다. 이 파일은 내용이
// 고정이므로 빌드 때 한 번 만들어 파일로 떨군다고 알려준다.
export const dynamic = "force-static";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "하비데이 HOBIDAY",
    short_name: "하비데이",
    description: "취미로 시작해서, 사람으로 끝나는 하루 — 볼더링 모임 매칭",
    start_url: "/",
    display: "standalone", // 주소창·탭 숨김
    background_color: "#f7f8fa",
    theme_color: "#f7f8fa",
    lang: "ko",
    icons: [
      // apple-icon.tsx / icon.tsx 가 빌드 때 PNG 로 생성된다
      { src: "/icon", sizes: "32x32", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
