"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import ClimbingShoe from "@/components/ClimbingShoe";
import { PlayIcon } from "@/components/icons";

const BANNERS = [
  {
    id: "shoe",
    href: "/me",
    title: ["오늘의 완등을,", "나만의 색으로"],
    action: "내 클라이밍화 보기",
    label: "클라이밍화 배너 보기",
    background: "bg-accent-soft",
  },
  {
    id: "news",
    href: "/community?tab=news",
    title: ["놓치기 아쉬운", "클라이밍 소식"],
    action: "클라이밍 뉴스 보러가기",
    label: "클라이밍 뉴스 배너 보기",
    background: "bg-[#f1f4f8]",
  },
  {
    id: "video",
    href: "/videos",
    title: ["오늘의 등반을,", "영상으로 나눠요"],
    action: "클라이밍 영상 보러가기",
    label: "클라이밍 영상 배너 보기",
    background: "bg-[#eaf6d5]",
  },
] as const;

/** 자동 전환 없이 스와이프나 하단 버튼으로 넘기는 홈 배너. */
export default function HomeBanner() {
  const [active, setActive] = useState(0);
  const rail = useRef<HTMLDivElement>(null);
  const railId = useId();

  const show = (index: number) => {
    const element = rail.current;
    if (!element) return;
    element.scrollTo({
      left: index * (element.clientWidth + 12),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  };

  return (
    <section className="mt-4" aria-label="하비데이 소식" aria-roledescription="캐러셀">
      <div
        ref={rail}
        id={railId}
        onScroll={(event) => {
          const element = event.currentTarget;
          setActive(Math.max(0, Math.min(BANNERS.length - 1, Math.round(element.scrollLeft / (element.clientWidth + 12)))));
        }}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain rounded-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {BANNERS.map((banner) => (
          <Link
            key={banner.id}
            href={banner.href}
            aria-label={`${banner.title.join(" ")}. ${banner.action}`}
            className={`relative flex min-h-[108px] w-full shrink-0 snap-start snap-always items-center overflow-hidden rounded-2xl pl-5 pr-3 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-accent active:opacity-80 ${banner.background}`}
          >
            <div className="relative z-10 min-w-0 flex-1 py-4">
              <p className="text-[17px] font-bold leading-[1.35] tracking-tight text-ink">
                {banner.title[0]}
                <br />
                {banner.title[1]}
              </p>
              <p className={`mt-2 flex items-center gap-1 text-[12px] font-semibold ${banner.id === "video" ? "text-[#496b26]" : "text-accent-strong"}`}>
                {banner.action}
                <span aria-hidden="true">→</span>
              </p>
            </div>
            <div aria-hidden="true" className="relative w-[116px] shrink-0 self-stretch min-[380px]:w-[132px]">
              {banner.id === "shoe" ? (
                <>
                  <div className="absolute top-1/2 right-0 h-24 w-24 -translate-y-1/2 rounded-full bg-white/70" />
                  <ClimbingShoe color="blue" className="absolute top-1/2 right-0 w-[116px] -translate-y-1/2 -rotate-12 min-[380px]:w-[132px]" />
                </>
              ) : banner.id === "news" ? (
                <div className="absolute top-1/2 right-2 w-[90px] -translate-y-1/2 rotate-[9deg] rounded-xl bg-white p-3 shadow-[0_5px_16px_rgba(25,31,40,0.08)]">
                  <p className="text-[8px] font-bold tracking-[1.5px] text-accent-strong">HOBIDAY</p>
                  <p className="text-[21px] font-extrabold tracking-tight text-ink">NEWS</p>
                  <div className="mt-1.5 h-1.5 rounded-full bg-accent/30" />
                  <div className="mt-1.5 h-1 w-4/5 rounded-full bg-line" />
                  <div className="mt-1 h-1 w-3/5 rounded-full bg-line" />
                </div>
              ) : (
                <>
                  <div className="absolute top-1/2 right-0 h-24 w-24 -translate-y-1/2 rounded-full bg-white/45" />
                  <div className="absolute top-1/2 right-0 w-[110px] -translate-y-1/2 rotate-[7deg] rounded-xl border border-white bg-white p-1.5 shadow-[0_6px_16px_rgba(61,82,35,0.16)] min-[380px]:w-[124px]">
                    <div className="relative h-[78px] overflow-hidden rounded-md bg-[#56714c] min-[380px]:h-[84px]">
                      <Image src="/images/news/summer-training-v2.webp" alt="" fill unoptimized sizes="112px" className="object-cover object-[60%_center]" />
                      <div className="absolute inset-x-0 bottom-0 h-9 bg-gradient-to-t from-black/45 to-transparent" />
                      <span className="absolute right-1.5 bottom-2 flex h-6 w-6 items-center justify-center rounded-full bg-white/95 text-[#496b26] shadow-sm">
                        <PlayIcon size={17} className="ml-0.5" />
                      </span>
                      <div className="absolute inset-x-1.5 bottom-1 h-0.5 rounded-full bg-white/45"><div className="h-full w-1/3 rounded-full bg-white" /></div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </Link>
        ))}
      </div>
      <div className="flex h-8 items-center justify-center" aria-label="배너 선택">
        {BANNERS.map((banner, index) => (
          <button
            key={banner.id}
            type="button"
            aria-label={banner.label}
            aria-pressed={active === index}
            aria-controls={railId}
            onClick={() => show(index)}
            className="flex h-8 w-9 items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span aria-hidden="true" className={`h-1.5 rounded-full ${active === index ? "w-4 bg-accent-strong" : "w-1.5 bg-line"}`} />
          </button>
        ))}
      </div>
    </section>
  );
}
