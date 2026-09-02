"use client";

/* 모임 찾기 필터 — 목록 위에 가로로 늘어선 버튼들.
   버튼 하나가 조건 하나고, 누르면 그 조건만 다루는 설정 화면이 아래에서
   올라온다. 고른 값은 버튼 안에 그대로 적혀서, 열어보지 않아도 지금
   무슨 조건이 걸려 있는지 보인다.

   시간 · 레벨 · 나이대는 범위로 잡는다. 성비를 고르면 정원 화면이 그에
   맞춰 바뀐다 — 모임 만들기와 같은 짜임이다. */

import { useState } from "react";
import Calendar, { monthOf } from "@/components/Calendar";
import { LEVELS, type LevelId } from "@/lib/levels";
import { GENDER_MODES } from "@/lib/capacity";
import {
  AGE_BANDS,
  AGE_FROM,
  ageRangeLabel,
  ageToOptions,
  clampAgeTo,
} from "@/lib/meetupOptions";
import {
  EMPTY_FILTER,
  activeFilterCount,
  seatChoices,
  withGenderMode,
  ymd,
  type SessionFilter,
} from "@/lib/sessionFilter";

/* 성비와 정원은 한 버튼이다. 정원의 선택지가 성비를 따라가므로 따로
   두면 "성비를 먼저 골라야 한다" 를 말로 설명해야 한다 — 한 화면에
   위아래로 놓으면 순서가 그냥 보인다. */
type Facet = "gym" | "date" | "time" | "crew" | "level" | "age";

const TITLES: Record<Facet, string> = {
  gym: "짐",
  date: "날짜",
  time: "시간",
  crew: "성비 · 정원",
  level: "레벨",
  age: "나이대",
};

/** 고른 게 있으면 버튼에 그 값을 적는다 — 없으면 조건 이름 그대로 */
function chipLabel(f: SessionFilter, k: Facet): string {
  switch (k) {
    case "gym":
      return f.gyms.length === 0
        ? "짐"
        : f.gyms.length === 1
          ? f.gyms[0]
          : `짐 ${f.gyms.length}`;
    case "date": {
      if (!f.dateFrom && !f.dateTo) return "날짜";
      const md = (v: string) => {
        const [, m, d] = v.split("-");
        return `${Number(m)}/${Number(d)}`;
      };
      if (f.dateFrom && f.dateTo)
        return f.dateFrom === f.dateTo
          ? md(f.dateFrom)
          : `${md(f.dateFrom)}~${md(f.dateTo)}`;
      return f.dateFrom ? `${md(f.dateFrom)}~` : `~${md(f.dateTo)}`;
    }
    case "time":
      if (!f.timeFrom && !f.timeTo) return "시간";
      if (f.timeFrom && f.timeTo) return `${f.timeFrom}~${f.timeTo}`;
      return f.timeFrom ? `${f.timeFrom}~` : `~${f.timeTo}`;
    case "crew": {
      const mode = f.genderMode
        ? GENDER_MODES.find((m) => m.id === f.genderMode)!.label
        : "";
      const opts = seatChoices(f.genderMode);
      const seats =
        f.seats.length === 0
          ? ""
          : f.seats.length === 1
            ? opts.find((o) => o.seats === f.seats[0])!.label
            : `정원 ${f.seats.length}`;
      if (mode && seats) return `${mode} · ${seats}`;
      return mode || seats || "성비 · 정원";
    }
    case "level":
      if (!f.levelMin || !f.levelMax) return "레벨";
      return f.levelMin === f.levelMax
        ? `L${f.levelMin}`
        : `L${f.levelMin}~L${f.levelMax}`;
    case "age":
      return f.ageFrom == null || f.ageTo == null
        ? "나이대"
        : ageRangeLabel(f.ageFrom, f.ageTo);
  }
}

/** 시트 안의 선택지 */
function Opt({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3.5 py-2 text-[13px] font-medium transition-colors ${
        on ? "border-accent bg-accent text-white" : "border-line bg-surface text-muted"
      }`}
    >
      {children}
    </button>
  );
}

/* 폭은 여기서 주지 않는다. 날짜·시각 입력은 브라우저가 내용에 맞춰
   잡아주는데, w-full 을 걸면 "2026-08-29" 한 줄을 담으려고 칸이 화면 끝까지
   늘어난다. 칸을 다 써야 하는 쪽(짐 검색창, 나이대 두 칸)만 붙여 쓴다.
   (iOS 는 16px 미만 입력창에 포커스하면 화면을 강제로 확대한다 — 16px 유지) */
const inputCls =
  "rounded-lg bg-surface2 px-3 py-2.5 text-[16px] text-ink [color-scheme:light] focus:outline-none";

/* 짐 필터의 선택지 — gym master 에서 온다. master 를 못 받는 환경에서는
   이름만 있는 항목으로도 동작한다 (legacy 모임의 자유입력 이름 포함). */
export interface GymOption {
  name: string;
  region?: string | null;
  city_district?: string | null;
  brand?: string | null;
  aliases?: string[] | null;
}

/** 띄어쓰기·대소문자 차이로 못 찾는 일이 없게 눌러서 비교한다 */
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");

function gymMatches(o: GymOption, q: string) {
  const n = norm(q);
  if (!n) return true;
  return [o.name, o.brand, o.region, o.city_district, ...(o.aliases ?? [])]
    .filter(Boolean)
    .some((v) => norm(v as string).includes(n));
}

/* 서울/경기 200곳을 한 번에 그리면 시트가 목록 그 자체가 된다 —
   검색으로 좁히게 하고, 그 전에는 앞쪽만 보여준다 */
const GYM_SHOWN_MAX = 60;

export default function SessionFilterBar({
  value: f,
  onChange,
  gyms,
}: {
  value: SessionFilter;
  onChange: (next: SessionFilter) => void;
  gyms: GymOption[];
}) {
  const [open, setOpen] = useState<Facet | null>(null);
  // 짐 검색 — 시트를 닫아도 남겨둔다 (다시 열어 이어서 고르는 흐름)
  const [gymQ, setGymQ] = useState("");
  const [gymRegion, setGymRegion] = useState<"" | "서울" | "경기">("");
  // 달력이 보고 있는 달 — 시트를 닫았다 열어도 고른 달에 머문다
  const [month, setMonth] = useState(monthOf(""));

  /* 배열형 조건은 눌렀다 다시 누르면 빠진다 */
  const toggle = <T,>(list: T[], v: T): T[] =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  /* 레벨 범위 — 밖을 누르면 그쪽으로 넓히고, 안을 누르면 그 한 칸으로
     좁힌다. 모임 만들기의 레벨 고르기와 같은 손놀림이고, 제한도 이제
     양쪽 다 없다 (여는 쪽의 "인접 1단계" 는 09-01 에 풀렸다). */
  const pickLevel = (id: LevelId) => {
    if (!f.levelMin || !f.levelMax) return onChange({ ...f, levelMin: id, levelMax: id });
    if (id < f.levelMin) return onChange({ ...f, levelMin: id });
    if (id > f.levelMax) return onChange({ ...f, levelMax: id });
    onChange({ ...f, levelMin: id, levelMax: id });
  };

  const clear: Record<Facet, Partial<SessionFilter>> = {
    gym: { gyms: [] },
    date: { dateFrom: "", dateTo: "" },
    time: { timeFrom: "", timeTo: "" },
    crew: { genderMode: null, seats: [] },
    level: { levelMin: null, levelMax: null },
    age: { ageFrom: null, ageTo: null },
  };

  const today = ymd(new Date());
  const lastAge = AGE_BANDS[AGE_BANDS.length - 1].to;
  const seatOpts = seatChoices(f.genderMode);

  return (
    <>
      {/* 가로 스크롤 — 화면 밖으로 흘러나가게 좌우 여백을 뚫는다 */}
      <div className="-mx-4 overflow-x-auto px-4 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max gap-1.5">
          {(Object.keys(TITLES) as Facet[]).map((k) => {
            const label = chipLabel(f, k);
            const on = label !== TITLES[k];
            return (
              <button
                key={k}
                type="button"
                onClick={() => setOpen(k)}
                className={`flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-[13px] transition-colors ${
                  on
                    ? "border-accent bg-accent-soft font-medium text-accent-pressed"
                    : "border-line bg-surface text-muted"
                }`}
              >
                {label}
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            );
          })}
          {/* 몇 개가 걸렸는지는 숫자로 말하지 않는다. 켜진 버튼이 색으로
              이미 말하고 있고, 옆에 붙은 숫자는 결과 개수로도 읽힌다. */}
          {activeFilterCount(f) > 0 && (
            <button
              type="button"
              onClick={() => onChange(EMPTY_FILTER)}
              className="shrink-0 rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] text-muted"
            >
              초기화
            </button>
          )}
        </div>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/50"
          onClick={() => setOpen(null)}
        >
          <div
            className="mx-auto max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-5"
            style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="text-[16px] font-bold">{TITLES[open]}</p>
              <button
                type="button"
                onClick={() => onChange({ ...f, ...clear[open] })}
                className="text-[12.5px] font-medium text-muted"
              >
                지우기
              </button>
            </div>

            {open === "gym" && (() => {
              /* 고른 것은 검색과 무관하게 맨 위에 둔다 — 안 그러면 검색어를
                 바꾸는 순간 내가 뭘 골랐는지 안 보인다 */
              const picked = f.gyms.map(
                (name) => gyms.find((o) => o.name === name) ?? { name }
              );
              const rest = gyms.filter(
                (o) =>
                  !f.gyms.includes(o.name) &&
                  (!gymRegion || o.region === gymRegion) &&
                  gymMatches(o, gymQ)
              );
              const shown = rest.slice(0, GYM_SHOWN_MAX);
              const row = (o: GymOption, on: boolean) => (
                <button
                  key={o.name}
                  type="button"
                  onClick={() => onChange({ ...f, gyms: toggle(f.gyms, o.name) })}
                  className="flex w-full items-center justify-between gap-2 border-b border-line py-2.5 text-left last:border-b-0"
                >
                  <span className="min-w-0">
                    <span
                      className={`block truncate text-[14px] ${
                        on ? "font-semibold text-accent-pressed" : "text-ink"
                      }`}
                    >
                      {o.name}
                    </span>
                    {(o.region || o.city_district) && (
                      <span className="block truncate text-[11.5px] text-faint">
                        {[o.region, o.city_district].filter(Boolean).join(" ")}
                      </span>
                    )}
                  </span>
                  {on && (
                    <span className="shrink-0 text-[12px] font-medium text-accent-pressed">
                      선택됨
                    </span>
                  )}
                </button>
              );
              return (
                <>
                  <input
                    value={gymQ}
                    onChange={(e) => setGymQ(e.target.value)}
                    placeholder="암장 이름 · 지역으로 검색"
                    className={`mt-4 w-full ${inputCls}`}
                  />
                  {/* 지역 pill 은 master 를 받아 지역 정보가 있을 때만 —
                      폴백 목록(이름뿐)에서 켜면 전부 걸러져 빈 화면이 된다 */}
                  {gyms.some((o) => o.region) && (
                    <div className="mt-2 flex gap-1.5">
                      {(["", "서울", "경기"] as const).map((r) => (
                        <button
                          key={r || "all"}
                          type="button"
                          onClick={() => setGymRegion(r)}
                          className={`rounded-full border px-3 py-1.5 text-[13px] transition-colors ${
                            gymRegion === r
                              ? "border-accent bg-accent-soft font-medium text-accent-pressed"
                              : "border-line bg-surface text-muted"
                          }`}
                        >
                          {r || "전체"}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 max-h-[42vh] overflow-y-auto">
                    {picked.map((o) => row(o, true))}
                    {shown.map((o) => row(o, false))}
                    {rest.length > GYM_SHOWN_MAX && (
                      <p className="py-2.5 text-center text-[12px] text-faint">
                        {rest.length - GYM_SHOWN_MAX}곳 더 있어요 — 검색으로
                        좁혀주세요
                      </p>
                    )}
                    {picked.length === 0 && rest.length === 0 && (
                      <p className="py-6 text-center text-[12.5px] text-muted">
                        찾는 암장이 없어요
                      </p>
                    )}
                  </div>
                </>
              );
            })()}

            {open === "date" && (
              <>
                {/* 지난 날짜는 숫자 자체가 눌리지 않는다. <input type="date">
                    의 min 은 브라우저마다 굴는 게 달라서 — 어떤 데서는
                    흐려지고 어떤 데서는 그냥 눌린 뒤 값만 안 들어갔다 —
                    달력을 직접 그린다. */}
                <div className="mt-4">
                  <Calendar
                    from={f.dateFrom}
                    to={f.dateTo || f.dateFrom}
                    min={today}
                    month={month}
                    onMonth={setMonth}
                    onPick={(d) => {
                      /* 한 번 누르면 그 하루가 곧 결과다. 뒤의 날을 한 번
                         더 누르면 기간으로 넓어진다. 이미 기간이 잡혀
                         있거나 앞을 누르면 거기서 다시 시작한다 —
                         "지우고 다시" 를 시키지 않는다. */
                      const single = f.dateFrom && f.dateFrom === f.dateTo;
                      if (single && d > f.dateFrom)
                        return onChange({ ...f, dateTo: d });
                      onChange({ ...f, dateFrom: d, dateTo: d });
                    }}
                  />
                </div>
                <p className="mt-3 text-center text-[12.5px] text-muted">
                  {!f.dateFrom
                    ? "하루만 골라도 되고, 두 번 누르면 기간이 돼요"
                    : f.dateFrom === f.dateTo
                      ? "다른 날을 한 번 더 누르면 그날까지 넓어져요"
                      : "이 기간의 모임만 보여드려요"}
                </p>
              </>
            )}

            {open === "time" && (
              <>
                <p className="mt-4 text-[12.5px] text-muted">
                  모임이 <b className="text-ink">시작하는</b> 시각 기준이에요.
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="time"
                    value={f.timeFrom}
                    onChange={(e) => {
                      const v = e.target.value;
                      onChange({
                        ...f,
                        timeFrom: v,
                        timeTo: f.timeTo && v && f.timeTo < v ? v : f.timeTo,
                      });
                    }}
                    className={inputCls}
                  />
                  <span className="text-[13px] text-muted">~</span>
                  <input
                    type="time"
                    value={f.timeTo}
                    onChange={(e) => {
                      const v = e.target.value;
                      onChange({
                        ...f,
                        timeTo: v,
                        timeFrom: f.timeFrom && v && v < f.timeFrom ? v : f.timeFrom,
                      });
                    }}
                    className={inputCls}
                  />
                </div>
              </>
            )}

            {open === "crew" && (
              <>
                <p className="mt-4 text-[12px] font-medium text-muted">성비</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {GENDER_MODES.map((m) => (
                    <Opt
                      key={m.id}
                      on={f.genderMode === m.id}
                      onClick={() =>
                        onChange(
                          withGenderMode(f, f.genderMode === m.id ? null : m.id)
                        )
                      }
                    >
                      {m.label}
                    </Opt>
                  ))}
                </div>

                {/* 선택지가 위에서 고른 성비를 따라간다. 반반이면 홀수가
                    아예 안 나온다 — 3명을 고를 수 있으면 결과가 언제나 0이다 */}
                <p className="mt-4 text-[12px] font-medium text-muted">정원</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {seatOpts.map((o) => (
                    <Opt
                      key={o.seats}
                      on={f.seats.includes(o.seats)}
                      onClick={() => onChange({ ...f, seats: toggle(f.seats, o.seats) })}
                    >
                      {o.label}
                    </Opt>
                  ))}
                </div>
              </>
            )}

            {open === "level" && (
              <>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {LEVELS.map((l) => (
                    <Opt
                      key={l.id}
                      on={
                        !!f.levelMin &&
                        !!f.levelMax &&
                        l.id >= f.levelMin &&
                        l.id <= f.levelMax
                      }
                      onClick={() => pickLevel(l.id)}
                    >
                      L{l.id} {l.name}
                    </Opt>
                  ))}
                </div>
                <p className="mt-2.5 text-[12px] leading-relaxed text-muted">
                  {f.levelMin && f.levelMax
                    ? "범위 밖을 누르면 넓어지고, 안을 누르면 그 레벨만 남아요."
                    : "두 개를 누르면 범위가 돼요."}
                </p>
              </>
            )}

            {open === "age" && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <select
                  value={f.ageFrom ?? ""}
                  onChange={(e) => {
                    if (!e.target.value)
                      return onChange({ ...f, ageFrom: null, ageTo: null });
                    const v = Number(e.target.value);
                    onChange({
                      ...f,
                      ageFrom: v,
                      /* 한쪽만 고르면 걸러지지 않으니 반대쪽을 채워두고,
                         이미 고른 끝이 시작보다 앞이면 끌어올린다 */
                      ageTo: clampAgeTo(v, f.ageTo ?? lastAge),
                    });
                  }}
                  className={`w-full ${inputCls}`}
                >
                  <option value="">나이 무관</option>
                  {AGE_FROM.map(([label, v]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </select>
                <select
                  value={f.ageTo ?? ""}
                  onChange={(e) => {
                    if (!e.target.value)
                      return onChange({ ...f, ageFrom: null, ageTo: null });
                    onChange({
                      ...f,
                      ageTo: Number(e.target.value),
                      ageFrom: f.ageFrom ?? AGE_FROM[0][1],
                    });
                  }}
                  className={`w-full ${inputCls}`}
                >
                  <option value="">나이 무관</option>
                  {/* 끝 칸은 시작 칸을 따라간다 — 뒤집힌 범위를 못 만든다 */}
                  {ageToOptions(f.ageFrom ?? AGE_FROM[0][1]).map(([label, v]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="button"
              onClick={() => setOpen(null)}
              className="mt-5 w-full rounded-xl bg-accent py-3.5 text-[14px] font-semibold text-white active:bg-accent-pressed"
            >
              확인
            </button>
          </div>
        </div>
      )}
    </>
  );
}
