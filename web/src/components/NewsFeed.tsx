"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import NewsArtwork from "@/components/NewsArtwork";
import { ago, type Article } from "@/lib/community";
import { fetchNewsPage, hasSupabase } from "@/lib/supabase";
import { mockNewsPage, NEWS_PAGE, newsFeedHref, validNewsDate } from "@/lib/newsFeed";
import { useQueryParam } from "@/lib/queryId";

function NewsResults({ date }: { date: string }) {
  const [rows, setRows] = useState<Article[] | null>(hasSupabase() ? null : mockNewsPage(date));
  const [busy, setBusy] = useState(hasSupabase());
  const [error, setError] = useState(false);
  const [more, setMore] = useState(false);
  const [retry, setRetry] = useState(0);
  const alive = useRef(false);
  const fetching = useRef(false);
  useEffect(() => {
    let current = true; alive.current = true;
    if (hasSupabase()) fetchNewsPage(date).then(page => {
      if (!current) return;
      setRows(page); setMore(page.length === NEWS_PAGE); setError(false);
    }).catch(() => { if (current) setError(true); })
      .finally(() => { if (current) setBusy(false); });
    return () => { current = false; alive.current = false; };
  }, [date, retry]);
  const loadMore = async () => {
    if (busy || fetching.current || !rows?.length) return;
    fetching.current = true; setBusy(true); setError(false);
    try {
      const page = await fetchNewsPage(date, rows.at(-1));
      if (!alive.current) return;
      setRows(previous => [...(previous ?? []), ...page.filter(a => !previous?.some(p => p.id === a.id))]);
      setMore(page.length === NEWS_PAGE);
    } catch { if (alive.current) setError(true); }
    finally { fetching.current = false; if (alive.current) setBusy(false); }
  };
  return <div aria-busy={busy}>
    <div className="mt-4 flex items-center justify-between border-b border-line pb-2.5 text-[11.5px] text-faint">
      <span>{date ? date.replaceAll("-", ".") : "전체 뉴스"}</span><span>최신순</span>
    </div>
    <div className="divide-y divide-line">{rows?.map(a => <Link key={a.id} href={`/community/news?id=${a.id}`} className="flex items-start gap-3 py-4 transition-colors active:bg-surface2">
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 break-words text-[14px] font-semibold leading-snug">{a.title}</p>
        {a.summary && <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-muted">{a.summary}</p>}
        <p className="mt-1.5 text-[11px] text-faint">{ago(a.published_at)}</p>
      </div>
      <NewsArtwork article={a} thumbnail />
    </Link>)}</div>
    {rows?.length === 0 && !error && <p className="py-14 text-center text-[14px] text-muted">{date ? "이 날짜에 올라온 뉴스가 없어요" : "아직 올라온 뉴스가 없어요"}</p>}
    {busy && <p role="status" className="py-8 text-center text-sm text-faint">불러오는 중…</p>}
    {error && <div role="alert" className="py-8 text-center text-sm"><p>뉴스를 불러오지 못했어요</p>
      <button disabled={busy} onClick={() => { if (rows?.length) void loadMore(); else { setBusy(true); setError(false); setRetry(n => n + 1); } }} className="mt-3 font-semibold text-accent-strong">다시 시도</button>
    </div>}
    {more && !error && <button disabled={busy} onClick={loadMore} className="button-secondary mt-3 w-full rounded-xl py-3 text-sm">더 보기</button>}
  </div>;
}
export default function NewsFeed() {
  const param = useQueryParam("date");
  const [selected, setSelected] = useState<string | null>(null);
  const date = selected ?? validNewsDate(param);
  const change = (value: string) => {
    const next = validNewsDate(value); setSelected(next);
    window.history.replaceState(window.history.state, "", newsFeedHref(next));
  };
  return <section className="pb-6" aria-label="클라이밍 뉴스 목록">
    <div className="mt-4 flex items-center gap-2">
      <button type="button" aria-pressed={!date} onClick={() => change("")} className={`min-h-10 rounded-full px-4 text-[12.5px] font-medium ${!date ? "bg-ink text-white" : "bg-surface2 text-muted"}`}>전체</button>
      <label className="flex min-h-10 min-w-0 items-center gap-2 rounded-xl bg-surface2 px-3 text-[12px] text-muted">
        날짜 <input type="date" aria-label="뉴스 날짜 선택" value={date} onChange={e => change(e.target.value)} className="min-h-10 min-w-0 max-w-40 bg-transparent text-[14px] text-ink" />
      </label>
    </div>
    {param !== undefined && <NewsResults key={date} date={date} />}
  </section>;
}
