"use client";

/* 커뮤니티 — 영상 피드백 · 자유 게시판 · 대회 · 뉴스.
   대회 정보·클라이밍 뉴스는 크론이 밖에서 가져와 쌓아둔 기사를 읽는다
   (scripts/community-feed.mjs). 자유 게시판은 로그인한 누구나 쓴다.
   칸은 ?tab= 으로 기억한다 — 글을 읽고 돌아와도 같은 칸이 열리게. */

import { useEffect, useState } from "react";
import Link from "next/link";
import VideoFeedbackFeed from "@/components/VideoFeedbackFeed";
import { useQueryParam } from "@/lib/queryId";
import { AvatarFallback, PlusIcon } from "@/components/icons";
import { ChalkBagIllust } from "@/components/illustrations";
import {
  COMMUNITY_TABS,
  MOCK_ARTICLES,
  POST_PAGE,
  ago,
  competitionBadge,
  dateRange,
  isCommunityTab,
  mockPostSummaries,
  type Article,
  type ArticleKind,
  type CommunityTab,
  type PostSummary,
} from "@/lib/community";
import {
  currentUser,
  fetchArticles,
  fetchPosts,
  hasSupabase,
  signedPhotoUrls,
} from "@/lib/supabase";

/** 글쓴이 사진 — 비공개 버킷이라 서명 주소가 필요하다 */
async function photoUrls(rows: PostSummary[]) {
  const paths = rows.map((r) => r.photo).filter(Boolean) as string[];
  return paths.length ? signedPhotoUrls(paths) : {};
}

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

function NewsRow({ a }: { a: Article }) {
  return (
    <Outer href={a.url} className="block py-3.5 transition-colors active:bg-surface2">
      <p className="text-[14.5px] font-semibold leading-snug">{a.title}</p>
      {a.summary && (
        <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted">
          {a.summary}
        </p>
      )}
      <p className="mt-1 text-[12px] text-faint">
        {[a.source, ago(a.published_at)].filter(Boolean).join(" · ")}
      </p>
    </Outer>
  );
}

function PostRow({ p, photo }: { p: PostSummary; photo?: string }) {
  return (
    <Link
      href={`/community/post?id=${p.id}`}
      className="block py-3.5 transition-colors active:bg-surface2"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 truncate text-[15px] font-semibold">{p.title}</p>
        {p.comment_count > 0 && (
          <span className="shrink-0 text-[12px] font-medium text-accent-strong">
            💬 {p.comment_count}
          </span>
        )}
      </div>
      <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted">
        {p.preview}
      </p>
      <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-faint">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="h-4 w-4 rounded-full object-cover" />
        ) : (
          <AvatarFallback size={16} />
        )}
        {p.nickname ?? "탈퇴한 회원"} · {ago(p.created_at)}
      </p>
    </Link>
  );
}

export default function Community() {
  const mockMode = !hasSupabase();
  const q = useQueryParam("tab");
  // 주소의 ?tab= 이 먼저다 (없으면 영상 피드백). 탭을 누르면 그게 이긴다.
  const [picked, setPicked] = useState<CommunityTab | null>(null);
  const tab: CommunityTab | null =
    picked ?? (q === undefined ? null : isCommunityTab(q) ? q : "video");
  const [authed, setAuthed] = useState<boolean | null>(mockMode ? true : null);

  // 목데이터는 처음부터 들고 시작한다 — 받아올 게 없다
  const [articles, setArticles] = useState<Partial<Record<ArticleKind, Article[]>>>(
    mockMode ? MOCK_ARTICLES : {}
  );
  const [posts, setPosts] = useState<PostSummary[] | null>(
    mockMode ? mockPostSummaries() : null
  );
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [more, setMore] = useState(false); // 다음 장이 있을 수 있다
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mockMode) return;
    let alive = true;
    currentUser().then((u) => alive && setAuthed(!!u));
    return () => {
      alive = false;
    };
  }, [mockMode]);

  /* 칸을 열 때 그 칸만 받는다. 기사는 한 번 받으면 재사용, 게시판은 올 때마다
     새로 — 방금 글을 썼을 수 있다. 목데이터는 위에서 이미 들고 시작했다. */
  useEffect(() => {
    if (!tab || !authed || mockMode) return;
    let alive = true;
    (async () => {
      if (tab === "board") {
        const rows = (await fetchPosts()) ?? [];
        if (!alive) return;
        setPosts(rows);
        setMore(rows.length >= POST_PAGE);
        const urls = await photoUrls(rows);
        if (alive) setPhotos((p) => ({ ...p, ...urls }));
      } else if (tab !== "video" && !articles[tab]) {
        const rows = await fetchArticles(tab);
        if (alive) setArticles((a) => ({ ...a, [tab]: rows ?? [] }));
      }
    })();
    return () => {
      alive = false;
    };
    // articles 는 캐시일 뿐 — 채워질 때 다시 돌 이유가 없다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, authed, mockMode]);

  const select = (t: CommunityTab) => {
    setPicked(t);
    // 주소에 남긴다 — 글에서 뒤로 오면 같은 칸이 열린다. 히스토리는 안 쌓인다.
    window.history.replaceState(null, "", t === "video" ? "/community" : `/community?tab=${t}`);
  };

  /* 다음 장 — 마지막 글보다 오래된 것부터 */
  const loadMore = async () => {
    if (!posts?.length || mockMode) return;
    setBusy(true);
    const rows = (await fetchPosts(posts[posts.length - 1].created_at)) ?? [];
    setPosts((prev) => [...(prev ?? []), ...rows]);
    setMore(rows.length >= POST_PAGE);
    const urls = await photoUrls(rows);
    setPhotos((p) => ({ ...p, ...urls }));
    setBusy(false);
  };

  const list = tab && tab !== "board" && tab !== "video" ? articles[tab] : undefined;
  const upcoming = list?.filter((a) => a.starts_at) ?? [];
  const undated = list?.filter((a) => !a.starts_at) ?? [];

  return (
    <main className="px-4">
      <header className="flex items-center justify-between pt-6 pb-3">
        <h1 className="text-[20px] font-bold tracking-tight">커뮤니티</h1>
        {(tab === "board" || tab === "video") && authed && (
          <Link
            href={tab === "video" ? "/community/upload" : "/community/write"}
            className="flex items-center gap-1 py-1 text-[13.5px] font-semibold text-accent-strong"
          >
            <PlusIcon size={14} strokeWidth={2.2} />
            {tab === "video" ? "영상 올리기" : "글쓰기"}
          </Link>
        )}
      </header>

      <div className="flex gap-4 overflow-x-auto border-b border-line">
        {COMMUNITY_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => select(t.id)}
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

      {authed === false ? (
        <div className="mt-14 flex flex-col items-center gap-3 text-center">
          <p className="text-[14px] text-muted">로그인하면 커뮤니티를 볼 수 있어요</p>
          <Link
            href="/login"
            className="button-primary rounded-xl px-6 py-2.5 text-[14px] font-semibold"
          >
            로그인 하기
          </Link>
        </div>
      ) : !tab || authed === null ? null : tab === "video" ? (
        <VideoFeedbackFeed />
      ) : tab === "board" ? (
        posts === null ? (
          <p className="pt-16 text-center text-[13.5px] text-faint">불러오는 중…</p>
        ) : posts.length === 0 ? (
          <Empty title="아직 글이 없어요" />
        ) : (
          <div className="pb-6">
            <div className="flex flex-col divide-y divide-line">
              {posts.map((p) => (
                <PostRow key={p.id} p={p} photo={p.photo ? photos[p.photo] : undefined} />
              ))}
            </div>
            {more && (
              <button
                onClick={loadMore}
                disabled={busy}
                className="button-secondary mt-3 w-full rounded-xl py-3 text-[13.5px] font-medium"
              >
                {busy ? "불러오는 중…" : "더 보기"}
              </button>
            )}
          </div>
        )
      ) : !list ? (
        <p className="pt-16 text-center text-[13.5px] text-faint">불러오는 중…</p>
      ) : list.length === 0 ? (
        <Empty title="아직 모인 소식이 없어요" />
      ) : tab === "news" ? (
        <div className="flex flex-col divide-y divide-line pb-6">
          {list.map((a) => (
            <NewsRow key={a.id} a={a} />
          ))}
        </div>
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
