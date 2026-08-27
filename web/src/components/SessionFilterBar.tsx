"use client";

/* 모임 찾기 필터 — 목록 위에 가로로 늘어선 버튼들.
   버튼 하나가 조건 하나고, 누르면 아래에서 시트가 올라온다.
   고르는 즉시 목록이 걸러진다 ("적용" 을 따로 누르지 않는다). */

import { useState } from "react";
import { LEVELS, type LevelId } from "@/lib/levels";
import { GENDER_MODES } from "@/lib/capacity";
import {
  AGE_BANDS,
  EMPTY_FILTER,
  SEAT_CHOICES,
  TIME_BANDS,
  activeFilterCount,
  ymd,
  type SessionFilter,
  type TimeBand,
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

/** 고른 게 있으면 버튼에 그 값을 적는다 — 시트를 열지 않아도 보이게 */
function chipLabel(f: SessionFilter, k: Facet): string {
  const many = (n: number, base: string) => `${base} ${n}`;
  switch (k) {
    case "gym":
      return f.gyms.length === 0
        ? "짐"
        : f.gyms.length === 1
          ? f.gyms[0]
          : many(f.gyms.length, "짐");
    case "date": {
      if (!f.date) return "날짜";
      const [, m, d] = f.date.split("-");
      return `${Number(m)}/${Number(d)}`;
    }
    case "time":
      return f.times.length === 0
        ? "시간"
        : f.times.length === 1
          ? TIME_BANDS.find((b) => b.id === f.times[0])!.label
          : many(f.times.length, "시간");
    case "gender":
      return f.genderMode
        ? GENDER_MODES.find((m) => m.id === f.genderMode)!.label
        : "성비";
    case "seats":
      return f.seats.length === 0
        ? "정원"
        : f.seats.length === 1
          ? `${f.seats[0]}명`
          : many(f.seats.length, "정원");
    case "level":
      return f.levels.length === 0
        ? "레벨"
        : f.levels.length === 1
          ? `L${f.levels[0]}`
          : many(f.levels.length, "레벨");
    case "age":
      return f.ages.length === 0
        ? "나이대"
        : f.ages.length === 1
          ? AGE_BANDS.find((b) => b.id === f.ages[0])!.label
          : many(f.ages.length, "나이대");
  }
}

function isOn(f: SessionFilter, k: Facet) {
  return chipLabel(f, k) !== TITLES[k];
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

export default function SessionFilterBar({
  value: f,
  onChange,
  gyms,
}: {
  value: SessionFilter;
  onChange: (next: SessionFilter) => void;
  /** 지금 열려 있는 모임들의 짐 목록 — 없는 짐을 고르게 두지 않는다 */
  gyms: string[];
}) {
  const [open, setOpen] = useState<Facet | null>(null);
  const n = activeFilterCount(f);

  /* 배열형 조건은 눌렀다 다시 누르면 빠진다 */
  const toggle = <T,>(list: T[], v: T): T[] =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  const today = ymd(new Date());

  return (
    <>
      {/* 가로 스크롤 — 화면 밖으로 흘러나가게 좌우 여백을 뚫는다 */}
      <div className="-mx-4 overflow-x-auto px-4 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max gap-1.5">
          {(Object.keys(TITLES) as Facet[]).map((k) => {
            const on = isOn(f, k);
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
                {chipLabel(f, k)}
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
          {n > 0 && (
            <button
              type="button"
              onClick={() => onChange(EMPTY_FILTER)}
              className="shrink-0 rounded-full border border-line bg-surface px-3.5 py-2 text-[13px] font-semibold text-muted"
            >
              초기화 {n}
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
            <p className="text-[17px] font-extrabold">{TITLES[open]}</p>

            <div className="mt-4 flex flex-wrap gap-1.5">
              {open === "gym" &&
                (gyms.length === 0 ? (
                  <p className="text-[13px] text-muted">열려 있는 모임이 없어요.</p>
                ) : (
                  gyms.map((g) => (
                    <Opt
                      key={g}
                      on={f.gyms.includes(g)}
                      onClick={() => onChange({ ...f, gyms: toggle(f.gyms, g) })}
                    >
                      {g}
                    </Opt>
                  ))
                ))}

              {open === "date" && (
                /* 지난 날짜는 아예 못 고른다. 골라봐야 시작한 모임은
                   목록에서 내려가 결과가 언제나 0이다. */
                <input
                  type="date"
                  value={f.date}
                  min={today}
                  onChange={(e) => onChange({ ...f, date: e.target.value })}
                  className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-[16px] text-ink [color-scheme:dark]"
                />
              )}

              {open === "time" &&
                TIME_BANDS.map((b) => (
                  <Opt
                    key={b.id}
                    on={f.times.includes(b.id)}
                    onClick={() =>
                      onChange({ ...f, times: toggle<TimeBand>(f.times, b.id) })
                    }
                  >
                    {b.label}
                  </Opt>
                ))}

              {open === "gender" &&
                GENDER_MODES.map((m) => (
                  <Opt
                    key={m.id}
                    on={f.genderMode === m.id}
                    onClick={() =>
                      onChange({
                        ...f,
                        genderMode: f.genderMode === m.id ? null : m.id,
                      })
                    }
                  >
                    {m.label}
                  </Opt>
                ))}

              {open === "seats" &&
                SEAT_CHOICES.map((c) => (
                  <Opt
                    key={c}
                    on={f.seats.includes(c)}
                    onClick={() => onChange({ ...f, seats: toggle(f.seats, c) })}
                  >
                    {c}명
                  </Opt>
                ))}

              {open === "level" &&
                LEVELS.map((l) => (
                  <Opt
                    key={l.id}
                    on={f.levels.includes(l.id)}
                    onClick={() =>
                      onChange({ ...f, levels: toggle<LevelId>(f.levels, l.id) })
                    }
                  >
                    L{l.id} {l.name}
                  </Opt>
                ))}

              {open === "age" &&
                AGE_BANDS.map((b) => (
                  <Opt
                    key={b.id}
                    on={f.ages.includes(b.id)}
                    onClick={() => onChange({ ...f, ages: toggle(f.ages, b.id) })}
                  >
                    {b.label}
                  </Opt>
                ))}
            </div>

            {open === "date" && f.date && (
              <button
                type="button"
                onClick={() => onChange({ ...f, date: "" })}
                className="mt-3 text-[12.5px] font-semibold text-muted"
              >
                날짜 조건 지우기
              </button>
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
