"use client";

/* 암장 선택 — 모임 만들기가 쓰는 검색형 bottom sheet.
   서울/경기 200곳을 칩으로 늘어놓을 수는 없다 — 검색과 지역으로 좁혀서
   목록 행으로 고른다. pill 은 조작 가능한 필터(지역)에만 쓴다. */

import { useMemo, useState } from "react";
import type { Gym } from "@/lib/supabase";

/** 띄어쓰기·대소문자 차이로 못 찾는 일이 없게 눌러서 비교한다 */
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");

function matches(g: Gym, q: string) {
  const n = norm(q);
  if (!n) return true;
  return [
    g.name,
    g.brand,
    g.branch_name,
    g.region,
    g.city_district,
    g.subdistrict,
    ...(g.aliases ?? []),
  ]
    .filter(Boolean)
    .some((v) => norm(v as string).includes(n));
}

export default function GymPicker({
  gyms,
  onSelect,
  onClose,
}: {
  gyms: Gym[];
  onSelect: (g: Gym) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [region, setRegion] = useState<"" | "서울" | "경기">("");

  const shown = useMemo(() => {
    const list = gyms.filter(
      (g) => (!region || g.region === region) && matches(g, q)
    );
    /* 검색 없이 열면 200곳 전체다 — 다 그려도 되는 규모지만, 스크롤로
       찾게 두지 말고 검색을 유도한다. 정렬은 서버(gym_list)가 이미
       지역 → 구/시 → 이름으로 해뒀다. */
    return list;
  }, [gyms, q, region]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/50"
      onClick={onClose}
    >
      <div
        className="mx-auto flex h-[80vh] w-full max-w-md flex-col rounded-t-2xl bg-surface p-5"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[16px] font-bold">암장 선택</p>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="암장 이름 · 지역으로 검색"
          autoFocus
          className="mt-3 w-full rounded-lg bg-surface2 px-3.5 py-3 text-[16px] text-ink placeholder:text-faint focus:outline-none"
        />

        <div className="mt-2.5 flex gap-1.5">
          {(["", "서울", "경기"] as const).map((r) => (
            <button
              key={r || "all"}
              onClick={() => setRegion(r)}
              className={`rounded-full border px-3 py-1.5 text-[13px] transition-colors ${
                region === r
                  ? "border-accent bg-accent-soft font-medium text-accent-pressed"
                  : "border-line bg-surface text-muted"
              }`}
            >
              {r || "전체"}
            </button>
          ))}
        </div>

        <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
          {shown.length === 0 ? (
            <p className="pt-10 text-center text-[13px] text-muted">
              찾는 암장이 없어요. 다른 이름으로 검색해보세요.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-line">
              {shown.map((g) => (
                <button
                  key={g.id}
                  onClick={() => onSelect(g)}
                  className="py-3 text-left transition-colors active:bg-surface2"
                >
                  <p className="text-[14.5px] font-medium">{g.name}</p>
                  <p className="mt-0.5 truncate text-[12px] text-faint">
                    {[g.region, g.city_district, g.address]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          className="mt-3 w-full shrink-0 rounded-xl border border-line py-3 text-[14px] font-medium"
        >
          닫기
        </button>
      </div>
    </div>
  );
}
