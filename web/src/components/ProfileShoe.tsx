"use client";

import { useState } from "react";
import ClimbingShoe, { SHOE_COLORS, type ShoeColorId } from "@/components/ClimbingShoe";

/** 일러스트 검토 단계. 미리보기 색은 프로필 실력으로 저장하거나 환산하지 않는다. */
export default function ProfileShoe() {
  const [color, setColor] = useState<ShoeColorId>("blue");
  const palette = SHOE_COLORS.find((item) => item.id === color)!;

  return (
    <section className="border-t border-line px-4 pb-6 pt-5" aria-labelledby="profile-shoe-title">
      <div className="flex items-center justify-between">
        <h2 id="profile-shoe-title" className="text-[15px] font-semibold">내 암벽화</h2>
        <span className="text-[12px] text-faint">색상 미리보기</span>
      </div>
      <div className="mt-3 bg-white">
        <ClimbingShoe color={color} className="mx-auto w-full max-w-[280px]" />
      </div>
      <p aria-live="polite" className="-mt-1 text-center text-[14px] font-semibold" style={{ color: palette.ink }}>
        {palette.name}
      </p>
      <div role="group" aria-label="암벽화 색상 미리보기" className="mx-auto mt-4 grid max-w-[328px] grid-cols-7 gap-1">
        {SHOE_COLORS.map((item) => (
          <button key={item.id} type="button" aria-label={`${item.name} 암벽화 미리보기`} aria-pressed={color === item.id}
            title={item.name} onClick={() => setColor(item.id)}
            className="flex h-11 items-center justify-center rounded-lg outline-offset-2 transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transform-none">
            <span className="flex h-8 w-8 items-center justify-center rounded-full border-[1.5px] transition-colors"
              style={{ borderColor: color === item.id ? item.ink : "transparent" }}>
              <span className="flex h-6 w-6 items-center justify-center rounded-full border border-black/10" style={{ backgroundColor: item.base }}>
                {color === item.id && <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="m4 8 2.5 2.5L12 5" stroke={item.id === "white" || item.id === "yellow" ? "#3F493C" : "white"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>}
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
