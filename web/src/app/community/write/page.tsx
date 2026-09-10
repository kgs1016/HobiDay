"use client";

/* 글쓰기 · 수정 — /community/write (새 글) · /community/write?id= (수정) */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryId, useQueryParam } from "@/lib/queryId";
import BackButton from "@/components/BackButton";
import GearPreparing from "@/components/GearPreparing";
import { boardHref, BOARD_TOPICS, isBoardTopic, MOCK_POSTS, POST_BODY_MAX, POST_TITLE_MAX, type BoardTopic, type PostCategory } from "@/lib/community";
import { createPost, fetchPost, hasSupabase, updatePost } from "@/lib/supabase";

const ERRORS: Record<string, string> = {
  no_auth: "로그인이 필요해요",
  no_profile: "회원 정보를 불러오지 못했어요. 다시 시도해주세요",
  empty: "제목과 내용을 적어주세요",
  too_fast: "잠시 후 다시 써주세요",
  not_mine: "내가 쓴 글만 고칠 수 있어요",
  invalid_topic: "글 주제를 다시 선택해주세요",
};

export default function WritePost() {
  const id = useQueryId(); // null = 새 글, string = 수정
  const categoryQuery = useQueryParam("category");
  const topicQuery = useQueryParam("topic");
  const [pickedTopic, setPickedTopic] = useState<BoardTopic | null>(null);
  const topic = pickedTopic ?? (isBoardTopic(topicQuery) ? topicQuery : "daily");
  const [postCategory, setPostCategory] = useState<PostCategory | null>(null);
  const category = postCategory ?? (categoryQuery === "gear" ? "gear" : "board");
  const BOARD = boardHref(category);
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [loaded, setLoaded] = useState(false); // 수정 모드에서 글을 받았는가
  const [busy, setBusy] = useState(false);
  const ready = categoryQuery !== undefined && topicQuery !== undefined && (id === null || loaded);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const p = hasSupabase()
        ? await fetchPost(id)
        : await Promise.resolve(MOCK_POSTS.find((x) => x.id === id) ?? null);
      if (!p || !p.mine) {
        alert("고칠 수 없는 글이에요");
        router.replace("/community");
        return;
      }
      setTitle(p.title);
      setBody(p.body);
      setPostCategory(p.category ?? "board");
      setPickedTopic(p.topic ?? "daily");
      setLoaded(true);
    })();
  }, [id, router]);

  const canSubmit = title.trim().length > 0 && body.trim().length > 0 && !busy;

  const submit = async () => {
    if (!canSubmit || category === "gear") return;
    if (!hasSupabase()) {
      alert("목데이터 모드에서는 저장되지 않아요");
      return router.replace(BOARD);
    }
    setBusy(true);
    const r = id
      ? await updatePost(id, title.trim(), body.trim(), topic)
      : await createPost(title.trim(), body.trim(), category, topic);
    setBusy(false);
    if (r.error) return alert(ERRORS[r.error] ?? `실패: ${r.error}`);
    const postId = id ?? (r as { id?: string }).id;
    router.replace(postId ? `/community/post?id=${postId}` : BOARD);
  };

  if (!ready)
    return (
      <main className="px-4 pt-24 text-center text-[13.5px] text-faint">불러오는 중…</main>
    );

  if (category === "gear") return (
    <main className="px-4">
      <header className="flex items-center gap-2 pt-4"><BackButton to={BOARD} /><h1 className="text-[18px] font-bold">장비 추천</h1></header>
      <GearPreparing />
    </main>
  );

  return (
    <main className="px-4 pb-10">
      <header className="flex items-center gap-2 pt-4 pb-2">
        <BackButton fallback={BOARD} />
        <h1 className="flex-1 text-[18px] font-bold tracking-tight">
          {id ? "글 수정" : "글쓰기"}
        </h1>
        <button
          onClick={submit}
          disabled={!canSubmit}
          className="button-primary rounded-lg px-3.5 py-1.5 text-[13.5px] font-semibold"
        >
          {busy ? "저장 중…" : id ? "저장" : "올리기"}
        </button>
      </header>

      {category === "board" ? <div className="mt-3 flex items-center gap-3 border-b border-line pb-3">
        <label htmlFor="post-topic" className="text-[13px] font-semibold text-muted">글 주제</label>
        <select id="post-topic" value={topic} onChange={event => { if (isBoardTopic(event.target.value)) setPickedTopic(event.target.value); }}
          className="min-h-10 flex-1 rounded-lg bg-surface2 px-3 text-[16px] text-ink">
          {BOARD_TOPICS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div> : <p className="mt-2 text-[13px] font-semibold text-muted">장비 추천</p>}

      {/* iOS 는 16px 미만 입력창에 포커스하면 화면을 강제로 확대한다 */}
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value.slice(0, POST_TITLE_MAX))}
        placeholder="제목"
        className="mt-2 w-full border-b border-line bg-transparent py-3 text-[17px] font-semibold text-ink placeholder:font-normal placeholder:text-faint focus:border-accent focus:outline-none"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, POST_BODY_MAX))}
        placeholder="클라이밍 이야기, 궁금한 것, 클라이밍장 후기… 편하게 남겨주세요"
        rows={12}
        className="mt-2 w-full resize-none bg-transparent py-3 text-[16px] leading-relaxed text-ink placeholder:text-faint focus:outline-none"
      />
      <p className="text-right text-[12px] text-faint">
        {body.length} / {POST_BODY_MAX}
      </p>
    </main>
  );
}
