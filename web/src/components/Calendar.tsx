"use client";

/* 달 하나를 그리는 달력.
   <input type="date"> 를 쓰다 여기까지 왔다. min 을 걸어도 브라우저마다
   굴는 게 다르다 — 어떤 데서는 지난 날이 흐려지지만, 어떤 데서는 그냥
   눌리고 값만 안 들어간다. "안 눌리는 것" 과 "눌렀는데 아무 일도 안
   일어나는 것" 은 쓰는 사람에게 전혀 다른 경험이다.

   그래서 숫자 하나하나를 우리가 그린다. 범위 밖이면 button 이 정말로
   disabled 라, 눌리지도 않고 흐리게 보인다. */

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** "2026-08-29" — toISOString 은 UTC 라 한국 오전 9시 이전에 하루가 밀린다 */
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

export default function Calendar({
  from,
  to,
  onPick,
  min,
  max,
  month,
  onMonth,
}: {
  /** 고른 날 (하루면 from === to). 빈 문자열이면 아무것도 안 골랐다 */
  from: string;
  to: string;
  onPick: (ymd: string) => void;
  /** "YYYY-MM-DD" · 이 밖은 눌리지 않는다 */
  min?: string;
  max?: string;
  /** 보고 있는 달 "YYYY-MM" — 부모가 들고 있어야 시트를 닫아도 안 튄다 */
  month: string;
  onMonth: (m: string) => void;
}) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const lead = first.getDay(); // 1일이 무슨 요일인가 (앞의 빈칸 수)

  const shift = (by: number) => {
    const d = new Date(y, m - 1 + by, 1);
    onMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  // 이전 달이 통째로 min 아래면 넘길 이유가 없다 (다음 달도 마찬가지)
  const prevOff = !!min && ymd(new Date(y, m - 1, 0)) < min;
  const nextOff = !!max && ymd(new Date(y, m, 1)) > max;

  const cells = Array.from({ length: lead + daysInMonth }, (_, i) => {
    if (i < lead) return null;
    const day = i - lead + 1;
    const key = ymd(new Date(y, m - 1, day));
    return { day, key, off: (!!min && key < min) || (!!max && key > max) };
  });

  const Nav = ({ back }: { back?: boolean }) => (
    <button
      type="button"
      disabled={back ? prevOff : nextOff}
      onClick={() => shift(back ? -1 : 1)}
      aria-label={back ? "이전 달" : "다음 달"}
      className="px-2 py-1 text-[15px] text-muted disabled:opacity-25"
    >
      {back ? "‹" : "›"}
    </button>
  );

  return (
    <div>
      <div className="flex items-center justify-between">
        <Nav back />
        <p className="text-[13.5px] font-semibold">
          {y}년 {m}월
        </p>
        <Nav />
      </div>

      <div className="mt-2 grid grid-cols-7 gap-y-1 text-center">
        {DAYS.map((d) => (
          <span key={d} className="py-1 text-[11px] text-faint">
            {d}
          </span>
        ))}
        {cells.map((c, i) =>
          c === null ? (
            <span key={`p${i}`} />
          ) : (
            <button
              key={c.key}
              type="button"
              disabled={c.off}
              onClick={() => onPick(c.key)}
              className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full text-[13.5px] ${
                c.off
                  ? // 지난 날 · 범위 밖 — 눌리지 않고, 눌리지 않아 보인다
                    "text-faint/40"
                  : from && c.key >= from && to && c.key <= to
                    ? "bg-accent font-semibold text-white"
                    : "text-ink active:bg-surface2"
              }`}
            >
              {c.day}
            </button>
          )
        )}
      </div>
    </div>
  );
}

/** 부모가 첫 달을 정할 때 쓴다 — 고른 날이 있으면 그 달, 없으면 이번 달 */
export function monthOf(v: string, fallback = new Date()) {
  if (v) return v.slice(0, 7);
  return `${fallback.getFullYear()}-${String(fallback.getMonth() + 1).padStart(2, "0")}`;
}
