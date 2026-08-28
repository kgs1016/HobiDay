/* HOBIDAY 전용 일러스트 — flat 2D vector, 브랜드 하늘색 + neutral 만 쓴다.
   empty state·안내 화면에서 한 화면에 하나만 놓는다. 장식이 아니라
   "지금 이 화면이 비어 있는 이유"를 부드럽게 말해주는 그림. */

const SKY = "#5ba7f7";
const SKY_SOFT = "#eef6ff";
const GRAY = "#c9cfd6";
const GRAY_SOFT = "#f2f4f6";

type Props = { size?: number; className?: string };

/** 클라이밍 홀드 — 모임·세션이 비어 있을 때 */
export function HoldIllust({ size = 72, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M48 14c14 0 30 9 32 24 2 14-8 28-24 32-15 4-32-3-37-17-5-13 3-27 13-33 6-3.6 10-6 16-6Z"
        fill={SKY_SOFT}
        stroke={SKY}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <circle cx="48" cy="48" r="6" fill={SKY} />
      <path
        d="M30 62c4 4 10 7 17 7"
        stroke={SKY}
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 초크백 — 참여 기록·보낸 것이 비어 있을 때 */
export function ChalkBagIllust({ size = 72, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M30 36h36l-3 40a6 6 0 0 1-6 5.4H39a6 6 0 0 1-6-5.4l-3-40Z"
        fill={SKY_SOFT}
        stroke={SKY}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M30 36c0-6 8-11 18-11s18 5 18 11"
        stroke={SKY}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M38 47c3 2 7 3 10 3s7-1 10-3"
        stroke={SKY}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="66" cy="22" r="4" fill={GRAY} />
      <circle cx="74" cy="14" r="2.5" fill={GRAY} />
    </svg>
  );
}

/** 카라비너 — 연결·채팅이 비어 있을 때 */
export function CarabinerIllust({ size = 72, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M56 16c12 4 20 15 20 28 0 17-13 32-30 32S18 62 20 46c1.4-11 8-19 16-23"
        stroke={SKY}
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path d="M40 22 55 17" stroke={GRAY} strokeWidth="5" strokeLinecap="round" />
      <circle cx="76" cy="30" r="3" fill={GRAY} />
    </svg>
  );
}

/** 클라이밍 슈즈 — 프로필·사람 관련 화면이 비어 있을 때 */
export function ShoeIllust({ size = 72, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M18 58c0-14 10-30 24-30 8 0 10 8 18 12 10 5 20 6 20 14v6a4 4 0 0 1-4 4H24a6 6 0 0 1-6-6Z"
        fill={SKY_SOFT}
        stroke={SKY}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M18 56h62" stroke={SKY} strokeWidth="3" />
      <path
        d="M44 36c2 3 6 6 10 8M38 42c2 3 5 5 9 7"
        stroke={SKY}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="76" cy="20" r="3" fill={GRAY} />
      <circle cx="68" cy="14" r="2" fill={GRAY_SOFT} stroke={GRAY} strokeWidth="1.5" />
    </svg>
  );
}
