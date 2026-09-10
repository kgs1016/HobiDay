import Image from "next/image";

/** 루트 레이아웃에 한 번 표시한다. 화면 조회와 딥링크 처리는 뒤에서 바로 시작한다. */
export default function AppSplash() {
  return (
    <div className="app-splash" aria-hidden="true">
      <Image src="/brand/hobiday-logo.png" alt="" width={160} height={160} preload unoptimized />
    </div>
  );
}
