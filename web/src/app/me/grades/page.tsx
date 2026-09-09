"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import BackButton from "@/components/BackButton";
import ClimbingShoe from "@/components/ClimbingShoe";
import { ChevronRightIcon, SearchIcon } from "@/components/icons";
import { SHOE_STAGES } from "@/lib/shoeProgress";
import { useQueryParam } from "@/lib/queryId";
import { colorDifficulty, HOBI_DIFFICULTIES } from "@/lib/hobiDifficulty";
import {
  findGymGradeGuide, GYM_GRADE_GUIDES, matchesGradeGuide,
  type GymGradeGuide,
} from "@/lib/gymGrades";

type GuideTab = "stages" | "gyms";
const TABS = [{ id: "stages", label: "암벽화 단계" }, { id: "gyms", label: "브랜드별 난이도" }] as const;

export default function GradesPage() {
  const tab = useQueryParam("tab");
  const gym = useQueryParam("gym");
  const stage = useQueryParam("stage");
  return <main className="px-5 pb-8">
    <header className="flex items-center gap-1 py-4">
      <BackButton fallback="/me" />
      <h1 className="text-[18px] font-bold tracking-tight">난이도 · 단계 안내</h1>
    </header>
    {tab === undefined ? <p role="status" className="py-12 text-center text-sm text-muted">불러오는 중…</p> :
      <GradeGuide key={`${tab}:${gym}:${stage}`} initialTab={tab === "gyms" ? "gyms" : "stages"} initialGym={gym ?? ""} stage={stage ?? ""} />}
  </main>;
}

function GradeGuide({ initialTab, initialGym, stage }: { initialTab: GuideTab; initialGym: string; stage: string }) {
  const [tab, setTab] = useState<GuideTab>(initialTab);
  const tabButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const moveTab = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = event.key === "Home" ? 0 : event.key === "End" ? 1 :
      event.key === "ArrowRight" || event.key === "ArrowLeft" ? 1 - index : null;
    if (next === null) return;
    event.preventDefault(); setTab(TABS[next].id); tabButtons.current[next]?.focus();
  };
  return <>
    <div role="tablist" aria-label="기준표 종류" className="grid grid-cols-2 border-b border-line">
      {TABS.map((item, index) => <button key={item.id} ref={node => { tabButtons.current[index] = node; }}
        id={`guide-tab-${item.id}`} role="tab" aria-selected={tab === item.id} aria-controls={`guide-panel-${item.id}`}
        tabIndex={tab === item.id ? 0 : -1} onKeyDown={event => moveTab(event, index)} onClick={() => setTab(item.id)}
        className={`min-h-13 border-b-2 text-[16px] tracking-tight ${tab === item.id ? "border-ink font-bold text-ink" : "border-transparent font-medium text-muted"}`}>
        {item.label}
      </button>)}
    </div>
    <section id="guide-panel-stages" role="tabpanel" aria-labelledby="guide-tab-stages" hidden={tab !== "stages"}>
      <StageGuide stage={stage} onGyms={() => setTab("gyms")} />
    </section>
    <section id="guide-panel-gyms" role="tabpanel" aria-labelledby="guide-tab-gyms" hidden={tab !== "gyms"}>
      <GymGuides initialGym={initialGym} />
    </section>
  </>;
}

function StageGuide({ stage, onGyms }: { stage: string; onGyms: () => void }) {
  const selected = SHOE_STAGES.find(item => item.id === stage);
  return <>
    <div className="flex min-h-32 items-center justify-between gap-2 py-5">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.14em] text-accent-strong">HOBIDAY</p>
        <h2 className="mt-1.5 text-[22px] font-bold leading-snug tracking-tight">완등이 쌓이면,<br />암벽화도 한 단계</h2>
      </div>
      <ClimbingShoe color={selected?.id ?? "blue"} className="w-28 shrink-0" />
    </div>
    <div className="mb-4 flex flex-wrap items-center gap-2 text-[12px] text-muted">
      <span className="rounded-md bg-surface2 px-2.5 py-1.5 font-medium text-ink">최근 3개월 기준</span>
      <span>점수 + 난이도별 완등</span>
    </div>
    <table className="w-full table-fixed text-left text-[13px]">
      <caption className="sr-only">최근 3개월에 성취 점수와 해당 하비데이 난이도 완등 조건을 모두 충족하면 승급</caption>
      <thead className="border-b border-line text-[11px] text-muted"><tr>
        <th scope="col" className="w-[34%] pb-2.5 font-normal">암벽화 색</th>
        <th scope="col" className="w-[24%] pb-2.5 font-normal">점수</th>
        <th scope="col" className="pb-2.5 text-right font-normal">완등 조건</th>
      </tr></thead>
      <tbody>{SHOE_STAGES.map(item => <tr key={item.id} className={`border-b border-line ${selected?.id === item.id ? "bg-accent-soft/60" : ""}`}>
        <th scope="row" className="py-4 font-semibold">
          <span className="inline-flex items-center gap-2.5">
            <span aria-hidden="true" className="h-5 w-5 shrink-0 rounded-full border border-black/10" style={{ background: item.base }} />
            {item.name}
            {selected?.id === item.id && <span className="text-[10px] font-medium text-accent-strong">프로필</span>}
          </span>
        </th>
        <td className="py-4 tabular-nums text-muted">{item.points ? `${item.points.toLocaleString()}점` : "시작"}</td>
        <td className="py-4 text-right font-semibold tabular-nums">{item.minLevel ? `H${item.minLevel}+ ${item.required}개` : "—"}</td>
      </tr>)}</tbody>
    </table>
    <details className="mt-4 rounded-xl border border-line px-4 text-[12px]">
      <summary className="min-h-12 cursor-pointer content-center font-semibold">H 난이도별 점수</summary>
      <div className="grid grid-cols-4 gap-2 pb-4">{HOBI_DIFFICULTIES.map(item => <div key={item.level} className="rounded-lg bg-surface2 px-2 py-2 text-center">
        <p className="font-semibold">H{item.level}</p><p className="mt-1 text-muted">{item.points}점/개</p>
      </div>)}</div>
    </details>
    <div className="mt-6 space-y-4 text-[12px] leading-relaxed">
      <div><h3 className="font-semibold">승급해도 기록은 그대로</h3><p className="mt-1 text-muted">높은 난이도의 기록은 하위 조건에도 포함됩니다. 최근 3개월 범위를 벗어난 기록은 내역에 남고, 현재 단계는 다시 계산됩니다.</p></div>
      <div><h3 className="font-semibold">실제 완등 날짜 기준</h3><p className="mt-1 text-muted">한국 날짜로 3개월 전 같은 날부터 오늘까지 계산합니다. 날짜 없는 기존 기록은 완등일을 입력한 뒤 반영됩니다. 같은 문제는 중복 없이 기록해주세요.</p></div>
      <div><h3 className="font-semibold">색상 × 완등 수</h3><p className="mt-1 text-muted">클라이밍장 안에서 쉬운 색부터 어려운 색까지 H1~H11로 배치합니다. 색상별 점수에 완등 수를 곱해 합산하며, 점수와 완등 조건을 모두 충족한 가장 높은 단계가 적용됩니다.</p></div>
      <div><h3 className="font-semibold">하비데이 자체 기준</h3><p className="mt-1 text-muted">H는 V등급이 아닙니다. 같은 H라도 클라이밍장 간 실제 난이도가 같다는 뜻은 아닙니다. 초기 배점은 상대적인 성취를 나타내며, V등급 없이도 등록된 색상만으로 점수를 받습니다.</p></div>
      <div><h3 className="font-semibold">기타와 기존 기록</h3><p className="mt-1 text-muted">기타 클라이밍장·색상은 H난이도를 직접 선택할 수 있습니다. 색상 기준이 없는 기존 V기록은 별도 하비데이 배점으로 반영합니다. 난이도를 모두 모르면 개수만 기록됩니다.</p></div>
    </div>
    <button onClick={onGyms} className="mt-5 flex min-h-13 w-full items-center justify-between rounded-xl bg-surface2 px-4 text-[13px] font-semibold">
      브랜드별 난이도 찾기<ChevronRightIcon size={16} />
    </button>
  </>;
}

function GymGuides({ initialGym }: { initialGym: string }) {
  const [query, setQuery] = useState("");
  const [selectedName, setSelectedName] = useState(initialGym);
  const searchInput = useRef<HTMLInputElement>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const shouldFocusDetail = useRef(false);
  useEffect(() => {
    if (selectedName && shouldFocusDetail.current) {
      detailHeading.current?.focus(); shouldFocusDetail.current = false;
    }
  }, [selectedName]);

  const selectGuide = (guide: GymGradeGuide) => {
    shouldFocusDetail.current = true; setSelectedName(guide.name);
  };
  const guide = findGymGradeGuide(selectedName);
  const visible = GYM_GRADE_GUIDES.filter(item => matchesGradeGuide(item, query));

  if (selectedName) return <div className="pt-5">
    <button onClick={() => { setSelectedName(""); requestAnimationFrame(() => searchInput.current?.focus()); }}
      className="mb-4 min-h-10 text-[12px] font-medium text-muted">← 브랜드 목록</button>
    <h2 ref={detailHeading} tabIndex={-1} className="break-words text-[22px] font-bold tracking-tight outline-none">{guide?.name ?? selectedName}</h2>
    {guide && <p className="mt-1.5 text-[12px] text-muted">난이도 색상 · {guide.colors.length}단계</p>}
    {guide ? <>
      <div className="mt-6 rounded-2xl border border-line px-4 py-4">
        <div className="mb-4 flex items-center justify-between text-[11px] text-muted"><span>쉬움 → 어려움</span><span>번호순</span></div>
        <ol aria-label="쉬운 순서의 난이도 색상" className="grid grid-cols-5 gap-x-2 gap-y-5">
          {guide.colors.map((color, index) => <li key={color.name} className="flex flex-col items-center gap-2">
            <span aria-hidden="true" className="text-[10px] tabular-nums text-muted">{String(index + 1).padStart(2, "0")}</span>
            <span aria-hidden="true" className="h-8 w-8 rounded-full border border-black/10" style={{ background: color.hex }} />
            <span className="text-[12px] font-medium"><span className="sr-only">{index + 1}단계 </span>{color.name}</span>
            <span className="text-[10px] text-muted">H{colorDifficulty(guide.name, color.name)!.level} · {colorDifficulty(guide.name, color.name)!.points}점</span>
          </li>)}
        </ol>
      </div>
      {guide.note && <p className="mt-3 text-[11px] leading-relaxed text-muted">{guide.note}</p>}
    </> : <div className="mt-6 rounded-2xl bg-surface2 px-5 py-7">
      <p className="text-[15px] font-semibold">아직 등록된 기준표가 없어요</p>
      <p className="mt-2 text-[13px] leading-relaxed text-muted">기타 클라이밍장·색상으로 기록하고 하비데이 난이도를 직접 선택할 수 있습니다.</p>
    </div>}
  </div>;

  return <div className="pt-6">
    <h2 className="text-[22px] font-bold tracking-tight">브랜드별 색상 기준</h2>
    <div className="mt-5 flex items-center gap-2.5 rounded-xl bg-surface2 px-3.5 focus-within:ring-2 focus-within:ring-accent-strong">
      <SearchIcon size={19} className="shrink-0 text-muted" />
      <input ref={searchInput} type="search" aria-label="브랜드 또는 지점명 검색" value={query} onChange={event => setQuery(event.target.value)}
        placeholder="브랜드 · 지점명 검색" className="min-h-13 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-faint" />
    </div>
    <div className="mt-6 flex items-center justify-between text-[12px] text-muted"><h3>{query ? "검색 결과" : "브랜드 목록"}</h3><span aria-live="polite">{visible.length}개</span></div>
    {visible.length ? <div>{visible.map(item => <button key={item.id} onClick={() => selectGuide(item)}
      className="flex min-h-24 w-full items-center justify-between gap-3 border-b border-line py-5 text-left">
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2.5"><span className="text-[17px] font-bold tracking-tight">{item.name}</span>
          <span className="text-[11px] text-muted">{item.colors.length}단계</span></span>
        <span aria-hidden="true" className="mt-3 flex flex-wrap gap-1.5">{item.colors.map(color =>
          <span key={color.name} className="h-3.5 w-3.5 rounded-full border border-black/10" style={{ background: color.hex }} />)}</span>
      </span>
      <ChevronRightIcon size={17} className="shrink-0 text-faint" />
    </button>)}</div> : <p className="py-10 text-center text-[13px] text-muted">등록된 기준표가 없어요</p>}
  </div>;
}
