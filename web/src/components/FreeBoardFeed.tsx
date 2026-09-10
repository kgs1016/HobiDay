"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PostRow } from "@/components/BoardFeed";
import { ChevronRightIcon, SearchIcon } from "@/components/icons";
import { BOARD_TOPICS, mockBoardFeed, POST_PAGE, type BoardFeedPage, type BoardTopic, type PostSummary } from "@/lib/community";
import { fetchBoardFeed, hasSupabase, signedPhotoUrls } from "@/lib/supabase";

type Filters = { topic: BoardTopic | null; query: string };

/** 필터마다 다시 마운트해 이전 요청·커서가 다른 주제의 목록에 섞이지 않게 한다. */
function FilteredPosts({ topic, query, onPins }: Filters & { onPins: (pins: BoardFeedPage["pinned"]) => void }) {
  const mock = !hasSupabase();
  const [rows, setRows] = useState<PostSummary[] | null>(mock ? mockBoardFeed(topic, query).items : null);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(!mock);
  const [error, setError] = useState(false);
  const [more, setMore] = useState(false);
  const mounted = useRef(false);
  const fetching = useRef(false);

  useEffect(() => {
    mounted.current = true;
    if (mock) return () => { mounted.current = false; };
    let alive = true;
    fetchBoardFeed(topic, query).then(async page => {
      if (!page) throw new Error("load_failed");
      const urls = await signedPhotoUrls(page.items.map(p => p.photo).filter(Boolean) as string[]);
      if (!alive) return;
      onPins(page.pinned); setRows(page.items); setPhotos(urls); setMore(page.items.length === POST_PAGE);
    }).catch(() => { if (alive) setError(true); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; mounted.current = false; };
  }, [topic, query, mock, onPins]);

  const loadMore = async () => {
    if (busy || fetching.current) return;
    fetching.current = true;
    setBusy(true); setError(false);
    try {
      const page = await fetchBoardFeed(topic, query, rows?.at(-1));
      if (!page) throw new Error("load_failed");
      const urls = await signedPhotoUrls(page.items.map(p => p.photo).filter(Boolean) as string[]);
      if (!mounted.current) return;
      onPins(page.pinned);
      setRows(previous => [...(previous ?? []), ...page.items.filter(p => !previous?.some(old => old.id === p.id))]);
      setPhotos(previous => ({ ...previous, ...urls }));
      setMore(page.items.length === POST_PAGE);
    } catch {
      if (mounted.current) setError(true);
    } finally {
      fetching.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return <div aria-busy={busy}>
    <div className="divide-y divide-line">
      {rows?.map(p => <PostRow key={p.id} p={p} photo={p.photo ? photos[p.photo] : undefined} />)}
    </div>
    {rows?.length === 0 && !error && <div className="py-14 text-center">
      <p className="text-[14px] font-medium text-muted">{query ? "검색 결과가 없어요" : topic ? "아직 이 주제의 글이 없어요" : "아직 글이 없어요"}</p>
    </div>}
    {busy && <p role="status" className="py-8 text-center text-sm text-faint">불러오는 중…</p>}
    {error && <div role="alert" className="py-6 text-center text-sm">
      <p>글을 불러오지 못했어요</p>
      <button type="button" onClick={loadMore} disabled={busy} className="mt-3 font-semibold text-accent-strong">다시 시도</button>
    </div>}
    {more && !error && <button type="button" onClick={loadMore} disabled={busy} className="button-secondary mt-3 w-full rounded-xl py-3 text-sm">더 보기</button>}
  </div>;
}

export default function FreeBoardFeed({ topic, query, onChange }: Filters & { onChange: (filters: Filters) => void }) {
  const [pins, setPins] = useState<BoardFeedPage["pinned"]>(hasSupabase() ? [] : mockBoardFeed(null, "").pinned);
  const [searchOpen, setSearchOpen] = useState(!!query);
  const [draft, setDraft] = useState(query);

  return <section aria-label="자유게시판 목록" className="pb-6">
    {pins.length > 0 && <aside aria-label="운영팀 고정 글" className="mt-4 overflow-hidden rounded-xl border border-line bg-surface2/60">
      {pins.map((pin, index) => <Link key={pin.id} href={`/community/post?id=${pin.id}`}
        className={`flex min-h-11 items-center gap-2.5 px-3 py-2.5 active:bg-surface2 ${index ? "border-t border-line" : ""}`}>
        <span className="shrink-0 rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold text-accent-strong">공지</span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{pin.title}</span>
        <ChevronRightIcon size={14} className="shrink-0 text-faint" />
      </Link>)}
    </aside>}

    <div className="mt-4 flex items-center gap-2">
      <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="글 주제">
        {[{ id: null, label: "전체" }, ...BOARD_TOPICS].map(t => <button type="button" key={t.id ?? "all"}
          onClick={() => onChange({ topic: t.id, query })} aria-pressed={topic === t.id}
          className={`min-h-9 shrink-0 rounded-full px-3 text-[12.5px] font-medium transition-colors ${topic === t.id ? "bg-ink text-white" : "bg-surface2 text-muted"}`}>
          {t.label}
        </button>)}
      </div>
      <button type="button" aria-label={searchOpen ? "글 검색 닫기" : "글 검색"} aria-expanded={searchOpen} aria-controls="board-search"
        onClick={() => { if (searchOpen) { setDraft(""); onChange({ topic, query: "" }); } setSearchOpen(!searchOpen); }}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink active:bg-surface2">
        <SearchIcon size={21} />
      </button>
    </div>
    {searchOpen && <form id="board-search" role="search" className="mt-3 flex items-center gap-2 rounded-xl bg-surface2 px-3"
      onSubmit={event => { event.preventDefault(); onChange({ topic, query: draft.trim().slice(0, 80) }); }}>
      <input type="search" value={draft} maxLength={80} onChange={event => {
        setDraft(event.target.value);
        if (!event.target.value && query) onChange({ topic, query: "" });
      }}
        aria-label="자유게시판 검색어" placeholder="제목·내용 검색" autoFocus
        className="min-w-0 flex-1 bg-transparent py-3 text-[16px] outline-none placeholder:text-faint" />
      <button type="submit" className="py-3 text-[13px] font-semibold text-ink">검색</button>
    </form>}
    <div className="mt-4 flex items-center justify-between border-b border-line pb-2.5 text-[11.5px] text-faint">
      <span>{query ? `‘${query}’ 검색 결과` : "클라이머들의 이야기"}</span>
      <span className="ml-3 shrink-0">최신순</span>
    </div>
    <FilteredPosts key={`${topic ?? "all"}:${query}`} topic={topic} query={query} onPins={setPins} />
  </section>;
}
