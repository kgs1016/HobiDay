/* 암장 대표사진이 없을 때 그 자리에 놓는 표시.

   목록 카드(사각)는 "이미지 준비중" 이라고 적는다 — 2026-09-08 결정.
   사진이 없는 암장은 카카오맵에도 사진이 없는 곳들이라 당장 채울 수 없고,
   빈 회색 상자보다는 "준비 중" 이 상태를 정확히 말해준다.

   채팅 목록(원형 48px)은 글자가 안 들어가서 이름 앞 두 글자를 쓴다.
   "더클", "홍대" 정도라도 목록을 훑을 때 눈에 걸리는 손잡이가 된다.

   왜 우리가 그리는가 — 암장 로고는 그 암장의 상표라 허락 없이 못 쓰고,
   지도 앱 캡처·블로그 사진은 저작권이 남의 것이다. 글자와 색만으로 만든
   이 자리표시는 전부 우리 것이라 어디에 내도 문제가 없다.

   색은 디자인 토큰의 accent-soft/accent-strong 만 쓴다 — 캔버스가 흰색에
   하늘색 단일 accent 인 앱이라, 암장마다 다른 색을 주면 그 규칙이 깨진다. */

export default function GymFallback({
  name,
  size = 84,
  shape = "square",
  className = "",
}: {
  name: string;
  size?: number;
  /** 목록 카드는 사각(사진 자리), 채팅 목록은 원(아바타 자리) */
  shape?: "square" | "circle";
  className?: string;
}) {
  const radius = shape === "circle" ? "rounded-full" : "rounded-lg";
  const base = `flex shrink-0 select-none items-center justify-center ${radius} bg-accent-soft text-accent-strong ${className}`;

  if (shape === "circle") {
    // 공백·기호를 뺀 앞 두 글자. "더클라임 강남점" → "더클", "M2클라이밍" → "M2"
    const label = (name ?? "").replace(/[\s·\-_()]/g, "").slice(0, 2) || "짐";
    return (
      <span
        aria-hidden
        style={{ width: size, height: size, fontSize: Math.round(size * 0.3) }}
        className={`${base} font-bold tracking-tight`}
      >
        {label}
      </span>
    );
  }

  return (
    <span
      aria-label="이미지 준비중"
      style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.115)) }}
      className={`${base} text-center font-semibold leading-tight`}
    >
      이미지
      <br />
      준비중
    </span>
  );
}
