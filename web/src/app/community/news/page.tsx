"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import BackButton from "@/components/BackButton";
import { MOCK_ARTICLES, type Article } from "@/lib/community";
import { useQueryId } from "@/lib/queryId";
import { currentUser, fetchNewsArticle, hasSupabase } from "@/lib/supabase";

const NEWS = "/community?tab=news";
type State =
  | { status: "loading" | "login" | "missing" | "error" }
  | { status: "ready"; article: Article };

function NewsContent({ id }: { id: string | null }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async (): Promise<State> => {
      if (!id) return { status: "missing" };
      if (!hasSupabase()) {
        const article = MOCK_ARTICLES.news.find((a) => a.id === id);
        return article ? { status: "ready", article } : { status: "missing" };
      }
      if (!(await currentUser())) return { status: "login" };
      const result = await fetchNewsArticle(id);
      if (result.error) return { status: "error" };
      return result.article
        ? { status: "ready", article: result.article }
        : { status: "missing" };
    };
    load().then((next) => { if (alive) setState(next); }).catch(() => {
      if (alive) setState({ status: "error" });
    });
    return () => { alive = false; };
  }, [id, attempt]);

  if (state.status !== "ready") {
    return (
      <div className="pt-16 text-center">
        <p role={state.status === "error" ? "alert" : "status"} className="text-[14px] text-muted">
          {state.status === "loading" ? "불러오는 중…"
            : state.status === "login" ? "로그인하면 뉴스를 읽을 수 있어요"
              : state.status === "missing" ? "더 이상 제공되지 않는 뉴스예요"
                : "뉴스를 불러오지 못했어요"}
        </p>
        {state.status === "login" && (
          <Link href="/login" className="button-primary mt-4 inline-block rounded-xl px-6 py-3 text-[14px] font-semibold">로그인 하기</Link>
        )}
        {state.status === "error" && (
          <button type="button" onClick={() => { setState({ status: "loading" }); setAttempt((v) => v + 1); }} className="button-secondary mt-4 rounded-xl px-6 py-3 text-[14px] font-semibold">다시 시도</button>
        )}
        {state.status === "missing" && (
          <Link href={NEWS} className="button-secondary mt-4 inline-block rounded-xl px-6 py-3 text-[14px] font-semibold">뉴스 목록</Link>
        )}
      </div>
    );
  }

  const { article } = state;
  // 외부로 나가는 행동은 원문 버튼에서만 제공한다.
  const sourceUrl = article.url && /^https?:\/\//i.test(article.url) ? article.url : null;
  const date = new Date(article.published_at);
  const published = Number.isNaN(date.getTime()) ? null : date.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric" });

  return (
    <article className="pt-5 pb-8">
      <p className="text-[12px] font-semibold text-accent-strong">뉴스 요약</p>
      <h1 className="mt-2 text-[24px] font-bold leading-[1.4] tracking-tight [word-break:keep-all]">{article.title}</h1>
      <p className="mt-3 text-[12.5px] text-muted">
        {[article.source, published].filter(Boolean).join(" · ")}
      </p>
      <div className="mt-6 border-t border-line pt-6">
        {article.summary?.trim() ? (
          <p className="whitespace-pre-line text-[16px] leading-[1.9] text-ink [word-break:keep-all] [overflow-wrap:anywhere]">{article.summary}</p>
        ) : (
          <p className="text-[14px] leading-relaxed text-muted">요약이 등록되지 않았어요.{sourceUrl && " 원문에서 자세한 내용을 확인할 수 있어요."}</p>
        )}
      </div>
      {sourceUrl && (
        <footer className="mt-8 border-t border-line pt-5">
          {article.source && <p className="mb-3 text-[12px] text-muted">출처 · {article.source}</p>}
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="button-secondary flex min-h-12 items-center justify-center rounded-xl px-4 text-[14px] font-semibold" aria-label="원문 보기 (새 창)">원문 보기 ↗</a>
        </footer>
      )}
    </article>
  );
}

export default function NewsPage() {
  const id = useQueryId();
  return (
    <main className="px-4 pb-8">
      <header className="flex items-center gap-2 border-b border-line pt-4 pb-3">
        <BackButton to={NEWS} />
        <Link href={NEWS} className="text-[16px] font-semibold">클라이밍 뉴스</Link>
      </header>
      {id === undefined ? <p role="status" className="pt-16 text-center text-[14px] text-muted">불러오는 중…</p> : <NewsContent key={id ?? "missing"} id={id} />}
    </main>
  );
}
