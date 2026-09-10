"use client";

/* 게시판 — 자유게시판 · 대회 · 뉴스 · 장비 추천.
   대회 정보·클라이밍 뉴스는 크론이 밖에서 가져와 쌓아둔 기사를 읽는다
   (scripts/community-feed.mjs). 자유 게시판은 로그인한 누구나 쓴다.
   칸은 ?tab= 으로 기억한다 — 글을 읽고 돌아와도 같은 칸이 열리게. */

import { useEffect, useState } from "react";
import Link from "next/link";
import GearPreparing from "@/components/GearPreparing";
import NewsFeed from "@/components/NewsFeed";
import FreeBoardFeed from "@/components/FreeBoardFeed";
import { useRouter } from "next/navigation";
import { useQueryParam } from "@/lib/queryId";
import { PlusIcon } from "@/components/icons";
import { ChalkBagIllust } from "@/components/illustrations";
import {
  COMMUNITY_TABS,
  MOCK_ARTICLES,
  ago,
  competitionBadge,
  dateRange,
  isCommunityTab,
  isBoardTopic,
  freeBoardHref,
  type BoardTopic,
  type Article,
  type ArticleKind,
  type CommunityTab,
} from "@/lib/community";
import {
  currentUser,
  fetchArticles,
  hasSupabase,
} from "@/lib/supabase";

function Empty({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mt-16 flex flex-col items-center gap-1.5 text-center">
      <ChalkBagIllust size={64} />
      <p className="mt-3 text-[15px] font-semibold">{title}</p>
      {sub && (
        <p className="whitespace-pre-line text-[13px] leading-relaxed text-muted">
          {sub}
        </p>
      )}
    </div>
  );
}

/* 바깥 링크 — 네이티브 웹뷰는 target=_blank 를 시스템 브라우저로 넘긴다.
   주소가 없는 기사는 그냥 글로 둔다. */
function Outer({
  href,
  className,
  children,
}: {
  href: string | null;
  className: string;
  children: React.ReactNode;
}) {
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {children}
    </a>
  ) : (
    <div className={className}>{children}</div>
  );
}

function CompetitionRow({ a }: { a: Article }) {
  const badge = competitionBadge(a);
  return (
    <Outer href={a.url} className="block py-3.5 transition-colors active:bg-surface2">
      {badge && (
        <p className="flex items-center gap-2 text-[12px]">
          <span
            className={`rounded-md px-1.5 py-0.5 font-semibold ${
              badge.live ? "bg-accent-soft font-bold text-accent-strong" : "bg-surface2 text-muted"
            }`}
          >
            {badge.label}
          </span>
          <span className="text-muted">{dateRange(a)}</span>
        </p>
      )}
      <p className={`text-[15px] font-semibold leading-snug ${badge ? "mt-1.5" : ""}`}>
        {a.title}
      </p>
      {!badge && a.summary && (
        <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted">
          {a.summary}
        </p>
      )}
      <p className="mt-1 truncate text-[12px] text-faint">
        {[a.location, a.source, !badge && ago(a.published_at)]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </Outer>
  );
}

export default function Community() {
  const mockMode = !hasSupabase();
  const q = useQueryParam("tab");
  const topicQuery = useQueryParam("topic");
  const searchQuery = useQueryParam("q");
  const [pickedFilters, setPickedFilters] = useState<{ topic: BoardTopic | null; query: string } | null>(null);
  const boardFilters = pickedFilters ?? { topic: isBoardTopic(topicQuery) ? topicQuery : null, query: (searchQuery ?? "").trim().slice(0, 80) };
  const router = useRouter();
  // 주소의 ?tab= 이 먼저다 (없으면 자유게시판). 탭을 누르면 그게 이긴다.
  const [picked, setPicked] = useState<CommunityTab | null>(null);
  const tab: CommunityTab | null =
    picked ?? (q === undefined ? null : q === "video" ? null : isCommunityTab(q) ? q : "board");
  const [authed, setAuthed] = useState<boolean | null>(mockMode ? true : null);

  // 목데이터는 처음부터 들고 시작한다 — 받아올 게 없다
  const [articles, setArticles] = useState<Partial<Record<ArticleKind, Article[]>>>(
    mockMode ? MOCK_ARTICLES : {}
  );
  const [articleError, setArticleError] = useState(false);
  const [retry, setRetry] = useState(0);

  // 기존 알림·즐겨찾기의 영상 주소도 새 탭으로 이어진다.
  useEffect(() => {
    if (q === "video") router.replace("/videos");
  }, [q, router]);

  useEffect(() => {
    if (mockMode) return;
    let alive = true;
    currentUser().then((u) => alive && setAuthed(!!u));
    return () => {
      alive = false;
    };
  }, [mockMode]);

  // 뉴스와 대회 데이터는 분류별로 읽고 캐시한다.
  useEffect(() => {
    if (tab !== "competition" || !authed || mockMode || articles[tab]) return;
    let alive = true;
    fetchArticles(tab).then(rows => {
      if (!alive) return;
      if (!rows) { setArticleError(true); return; }
      setArticles(prev => ({ ...prev, [tab]: rows }));
      setArticleError(false);
    }).catch(() => { if (alive) setArticleError(true); });
    return () => { alive = false; };
    // articles는 캐시: 조회 성공으로 다시 실행하지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, authed, mockMode, retry]);

  const select = (t: CommunityTab) => {
    setPicked(t);
    setArticleError(false);
    // 주소에 남긴다 — 글에서 뒤로 오면 같은 칸이 열린다. 히스토리는 안 쌓인다.
    window.history.replaceState(window.history.state, "", t === "board" ? freeBoardHref(boardFilters.topic, boardFilters.query) : `/community?tab=${t}`);
  };

  const selectBoardFilters = (filters: { topic: BoardTopic | null; query: string }) => {
    setPickedFilters(filters);
    window.history.replaceState(window.history.state, "", freeBoardHref(filters.topic, filters.query));
  };

  const list = tab === "news" || tab === "competition" ? articles[tab] : undefined;
  const upcoming = list?.filter((a) => a.starts_at) ?? [];
  const undated = list?.filter((a) => !a.starts_at) ?? [];

  return (
    <main className="px-4">
      <header className="flex items-center justify-between pt-6 pb-3">
        <h1 className="text-[20px] font-bold tracking-tight">게시판</h1>
        {tab === "board" && authed && (
          <Link
            href={`/community/write?category=${tab}${tab === "board" && boardFilters.topic ? `&topic=${boardFilters.topic}` : ""}`}
            className="flex items-center gap-1 py-1 text-[13.5px] font-semibold text-accent-strong"
          >
            <PlusIcon size={14} strokeWidth={2.2} />
            글쓰기
          </Link>
        )}
      </header>

      <div className="flex justify-between gap-3 overflow-x-auto border-b border-line" aria-label="게시판 분류">
        {COMMUNITY_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => select(t.id)}
            aria-pressed={tab === t.id}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 pb-2.5 pt-1 text-[14px] ${
              tab === t.id
                ? "border-ink font-bold text-ink"
                : "border-transparent font-medium text-faint"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "gear" ? <GearPreparing /> : authed === false ? (
        <div className="mt-14 flex flex-col items-center gap-3 text-center">
          <p className="text-[14px] text-muted">로그인하면 게시판을 볼 수 있어요</p>
          <Link
            href="/login"
            className="button-primary rounded-xl px-6 py-2.5 text-[14px] font-semibold"
          >
            로그인 하기
          </Link>
        </div>
      ) : !tab || authed === null ? null : tab === "board" ? (
        topicQuery === undefined || searchQuery === undefined ? null : <FreeBoardFeed {...boardFilters} onChange={selectBoardFilters} />
      ) : tab === "news" ? <NewsFeed /> : articleError ? (
        <div role="alert" className="py-12 text-center text-sm">
          <p>소식을 불러오지 못했어요</p>
          <button onClick={() => { setArticleError(false); setRetry(v => v + 1); }} className="mt-3 font-semibold text-accent-strong">다시 시도</button>
        </div>
      ) : !list ? (
        <p className="pt-16 text-center text-[13.5px] text-faint">불러오는 중…</p>
      ) : list.length === 0 ? (
        <Empty title="아직 모인 소식이 없어요" />
      ) : (
        <div className="flex flex-col gap-6 py-2 pb-6">
          {upcoming.length > 0 && (
            <section>
              <h2 className="pt-2 text-[15px] font-bold">
                다가오는 대회{" "}
                <span className="font-normal text-muted">{upcoming.length}</span>
              </h2>
              <div className="flex flex-col divide-y divide-line">
                {upcoming.map((a) => (
                  <CompetitionRow key={a.id} a={a} />
                ))}
              </div>
            </section>
          )}
          {undated.length > 0 && (
            <section>
              <h2 className="pt-2 text-[15px] font-bold">대회 소식</h2>
              <div className="flex flex-col divide-y divide-line">
                {undated.map((a) => (
                  <CompetitionRow key={a.id} a={a} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
