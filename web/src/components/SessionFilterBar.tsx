"use client";

/* 모임 찾기 필터 — 목록 위에 가로로 늘어선 버튼들.
   버튼 하나가 조건 하나고, 누르면 그 조건만 다루는 설정 화면이 아래에서
   올라온다. 고른 값은 버튼 안에 그대로 적혀서, 열어보지 않아도 지금
   무슨 조건이 걸려 있는지 보인다.

   시간 · 레벨 · 나이대는 범위로 잡는다. 성비를 고르면 정원 화면이 그에
   맞춰 바뀐다 — 모임 만들기와 같은 짜임이다. */

import { useState } from "react";
import { LEVELS, type LevelId } from "@/lib/levels";
import { GENDER_MODES } from "@/lib/capacity";
import { AGE_FROM, AGE_TO, ageBandLabel } from "@/lib/meetupOptions";
import {
  EMPTY_FILTER,
  activeFilterCount,
  seatChoices,
  withGenderMode,
  ymd,
  type SessionFilter,
} from "@/lib/sessionFilter";

type Facet = "gym" | "date" | "time" | "gender" | "seats" | "level" | "age";

const TITLES: Record<Facet, string> = {
  gym: "짐",
  date: "날짜",
  time: "시간",
  gender: "성비",
  seats: "정원",
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
      if (!f.date) return "날짜";
      const [, m, d] = f.date.split("-");
      return `${Number(m)}/${Number(d)}`;
    }
    case "time":
      if (!f.timeFrom && !f.timeTo) return "시간";
      if (f.timeFrom && f.timeTo) return `${f.timeFrom}~${f.timeTo}`;
      return f.timeFrom ? `${f.timeFrom}~` : `~${f.timeTo}`;
    case "gender":
      return f.genderMode
        ? GENDER_MODES.find((m) => m.id === f.genderMode)!.label
        : "성비";
    case "seats": {
      if (f.seats.length === 0) return "정원";
      const opts = seatChoices(f.genderMode);
      return f.seats.length === 1
        ? opts.find((o) => o.seats === f.seats[0])!.label
        : `정원 ${f.seats.length}`;
    }
    case "level":
      if (!f.levelMin || !f.levelMax) return "레벨";
      return f.levelMin === f.levelMax
        ? `L${f.levelMin}`
        : `L${f.levelMin}~L${f.levelMax}`;
    case "age": {
      if (f.ageFrom == null || f.ageTo == null) return "나이대";
      const a = ageBandLabel(f.ageFrom);
      const b = ageBandLabel(f.ageTo);
      return a === b ? a : `${a}~${b}`;
    }
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
      className={`rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors ${
        on ? "bg-accent text-white" : "border border-line bg-bg text-muted"
      }`}
    >
      {children}
    </button>
  );
}

const inputCls =
  // iOS 는 16px 미만 입력창에 포커스하면 화면을 강제로 확대한다
  "w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-[16px] text-ink [color-scheme:dark]";

export default function SessionFilterBar({
  value: f,
  onChange,
  gyms,
}: {
  value: SessionFilter;
  onChange: (next: SessionFilter) => void;
  gyms: string[];
}) {
  const [open, setOpen] = useState<Facet | null>(null);

  /* 배열형 조건은 눌렀다 다시 누르면 빠진다 */
  const toggle = <T,>(list: T[], v: T): T[] =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  /* 레벨 범위 — 밖을 누르면 그쪽으로 넓히고, 안을 누르면 그 한 칸으로
     좁힌다. 모임 만들기의 레벨 고르기와 같은 손놀림이다. 다만 여기엔
     "인접 1단계" 제한이 없다 — 찾는 쪽은 넓게 볼 수 있어야 한다. */
  const pickLevel = (id: LevelId) => {
    if (!f.levelMin || !f.levelMax) return onChange({ ...f, levelMin: id, levelMax: id });
    if (id < f.levelMin) return onChange({ ...f, levelMin: id });
    if (id > f.levelMax) return onChange({ ...f, levelMax: id });
    onChange({ ...f, levelMin: id, levelMax: id });
  };

  const clear: Record<Facet, Partial<SessionFilter>> = {
    gym: { gyms: [] },
    date: { date: "" },
    time: { timeFrom: "", timeTo: "" },
    gender: { genderMode: null, seats: [] },
    seats: { seats: [] },
    level: { levelMin: null, levelMax: null },
    age: { ageFrom: null, ageTo: null },
  };

  const today = ymd(new Date());
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
                className={`flex shrink-0 items-center gap-1 rounded-full border px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                  on
                    ? "border-accent bg-accent/10 text-accent"
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
                  strokeWidth="3"
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
              className="shrink-0 rounded-full border border-line bg-surface px-3.5 py-2 text-[13px] font-semibold text-muted"
            >
              초기화
            </button>
          )}
        </div>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/60"
          onClick={() => setOpen(null)}
        >
          <div
            className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl border-t border-line bg-surface p-5"
            style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="text-[17px] font-extrabold">{TITLES[open]}</p>
              <button
                type="button"
                onClick={() => onChange({ ...f, ...clear[open] })}
                className="text-[12.5px] font-semibold text-muted"
              >
                지우기
              </button>
            </div>

            {open === "gym" && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {gyms.map((g) => (
                  <Opt
                    key={g}
                    on={f.gyms.includes(g)}
                    onClick={() => onChange({ ...f, gyms: toggle(f.gyms, g) })}
                  >
                    {g}
                  </Opt>
                ))}
              </div>
            )}

            {open === "date" && (
              /* 지난 날짜는 아예 못 고른다. 골라봐야 시작한 모임은 목록에서
                 내려가 결과가 언제나 0이다. */
              <input
                type="date"
                value={f.date}
                min={today}
                onChange={(e) => onChange({ ...f, date: e.target.value })}
                className={`mt-4 ${inputCls}`}
              />
            )}

            {open === "time" && (
              <>
                <p className="mt-4 text-[12.5px] text-muted">
                  모임이 <b className="text-ink">시작하는</b> 시각 기준이에요.
                </p>
                <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <input
                    type="time"
                    value={f.timeFrom}
                    onChange={(e) => onChange({ ...f, timeFrom: e.target.value })}
                    className={inputCls}
                  />
                  <span className="text-[13px] text-muted">~</span>
                  <input
                    type="time"
                    value={f.timeTo}
                    onChange={(e) => onChange({ ...f, timeTo: e.target.value })}
                    className={inputCls}
                  />
                </div>
              </>
            )}

            {open === "gender" && (
              <div className="mt-4 flex flex-wrap gap-1.5">
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
            )}

            {open === "seats" && (
              <>
                {/* 선택지가 성비를 따라간다. 반반이면 홀수가 아예 안 나온다 */}
                <div className="mt-4 flex flex-wrap gap-1.5">
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
                {!f.genderMode && (
                  <p className="mt-2.5 text-[12px] leading-relaxed text-muted">
                    성비를 먼저 고르면 그 방식의 정원만 보여드려요.
                  </p>
                )}
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
                  onChange={(e) =>
                    onChange({
                      ...f,
                      ageFrom: e.target.value ? Number(e.target.value) : null,
                      // 한쪽만 고르면 걸러지지 않는다 — 반대쪽을 끝까지 채운다
                      ageTo: f.ageTo ?? AGE_TO[AGE_TO.length - 1][1],
                    })
                  }
                  className={inputCls}
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
                  onChange={(e) =>
                    onChange({
                      ...f,
                      ageTo: e.target.value ? Number(e.target.value) : null,
                      ageFrom: f.ageFrom ?? AGE_FROM[0][1],
                    })
                  }
                  className={inputCls}
                >
                  <option value="">나이 무관</option>
                  {AGE_TO.map(([label, v]) => (
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
              className="mt-5 w-full rounded-xl bg-accent py-3.5 text-[14px] font-bold text-white"
            >
              확인
            </button>
          </div>
        </div>
      )}
    </>
  );
}
