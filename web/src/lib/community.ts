/* 커뮤니티 — 타입 · 표시 도우미 · 목데이터.
   데이터 접근은 supabase.ts 의 "커뮤니티" 절에 있다.
   서버 기준은 supabase/migrations/20260906120000_community.sql */

import editorial from "@/content/editorial-2026-09-09.json";
import notices from "@/content/board-notices.json";

export type ArticleKind = "competition" | "news";
export type PostCategory = "board" | "gear";
export const BOARD_TOPICS = [
  { id: "daily", label: "일상" },
  { id: "question", label: "질문" },
  { id: "gym", label: "클라이밍장 후기" },
  { id: "lost", label: "분실물" },
] as const;
export type BoardTopic = (typeof BOARD_TOPICS)[number]["id"];
export const isBoardTopic = (value: unknown): value is BoardTopic => BOARD_TOPICS.some(t => t.id === value);
export const boardTopicLabel = (topic?: BoardTopic) => BOARD_TOPICS.find(t => t.id === topic)?.label ?? "일상";

export function freeBoardHref(topic: BoardTopic | null = null, query = "") {
  const params = new URLSearchParams();
  if (topic) params.set("topic", topic);
  if (query.trim()) params.set("q", query.trim().slice(0, 80));
  const search = params.toString();
  return `/community${search ? `?${search}` : ""}`;
}

export function boardHref(category: PostCategory = "board") {
  return category === "gear" ? "/community?tab=gear" : "/community";
}

export interface Article {
  id: string;
  kind: ArticleKind;
  title: string;
  summary: string | null;
  url: string | null;
  source: string | null;
  image_url: string | null;
  /** 대회: 장소. 뉴스는 null */
  location: string | null;
  /** 대회 일정 (YYYY-MM-DD). 뉴스에서 건진 대회 소식은 날짜가 없다 */
  starts_at: string | null;
  ends_at: string | null;
  published_at: string;
}

export interface PostSummary {
  id: string;
  category?: PostCategory;
  topic?: BoardTopic;
  pinned_rank?: number | null;
  title: string;
  preview: string;
  /** 탈퇴한 글쓴이는 null */
  author_id: string | null;
  nickname: string | null;
  photo: string | null;
  created_at: string;
  mine: boolean;
  comment_count: number;
}

export interface PostComment {
  id: string;
  author_id: string | null;
  nickname: string | null;
  photo: string | null;
  body: string;
  created_at: string;
  mine: boolean;
}

export interface PostDetail {
  id: string;
  category?: PostCategory;
  topic?: BoardTopic;
  pinned_rank?: number | null;
  title: string;
  body: string;
  author_id: string | null;
  nickname: string | null;
  photo: string | null;
  created_at: string;
  updated_at: string;
  mine: boolean;
  comments: PostComment[];
  video_path?: string | null;
  thumbnail_path?: string | null;
  liked?: boolean;
  like_count?: number;
}

export interface BoardFeedPage {
  pinned: { id: string; title: string; pinned_rank: number }[];
  items: PostSummary[];
}

export interface VideoSummary extends PostSummary {
  thumbnail_path: string;
  like_count: number;
}

export const FEEDBACK_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const VIDEO_PAGE = 12;

/* DB 체크 제약과 같은 값 — 한쪽만 바꾸지 말 것 */
export const POST_TITLE_MAX = 80;
export const POST_BODY_MAX = 3000;
export const COMMENT_MAX = 1000;
/** 목록 한 장 크기 — 이만큼 왔으면 다음 장이 있을 수 있다 */
export const POST_PAGE = 30;

export const COMMUNITY_TABS = [
  { id: "board", label: "자유게시판" },
  { id: "competition", label: "대회 정보" },
  { id: "news", label: "클라이밍 뉴스" },
  { id: "gear", label: "장비 추천" },
] as const;
export type CommunityTab = (typeof COMMUNITY_TABS)[number]["id"];

export function isCommunityTab(v: string | null | undefined): v is CommunityTab {
  return COMMUNITY_TABS.some((t) => t.id === v);
}

/** "방금 · 12분 전 · 3시간 전 · 어제 · 8/26" */
export function ago(iso: string) {
  const t = new Date(iso).getTime();
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  if (h < 48) return "어제";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 오늘 날짜 (기기 시각 기준) — "YYYY-MM-DD" */
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** 날짜 문자열끼리의 일수 차 (b - a). 시간대에 흔들리지 않게 정오로 맞춘다 */
function daysBetween(a: string, b: string) {
  const ta = new Date(`${a}T12:00:00`).getTime();
  const tb = new Date(`${b}T12:00:00`).getTime();
  return Math.round((tb - ta) / 86_400_000);
}

/** 대회 일정 칩 — "D-3" · "오늘" · "진행 중" · "종료". 날짜 없으면 null */
export function competitionBadge(a: Pick<Article, "starts_at" | "ends_at">) {
  if (!a.starts_at) return null;
  const today = todayKey();
  const end = a.ends_at ?? a.starts_at;
  if (daysBetween(today, end) < 0) return { label: "종료", live: false };
  const d = daysBetween(today, a.starts_at);
  if (d > 0) return { label: `D-${d}`, live: false };
  if (d === 0 && end === a.starts_at) return { label: "오늘", live: true };
  return { label: "진행 중", live: true };
}

/** "5/8 (금)" · "5/8 (금) ~ 5/10 (일)" */
export function dateRange(a: Pick<Article, "starts_at" | "ends_at">) {
  if (!a.starts_at) return "";
  const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
  const f = (s: string) => {
    const d = new Date(`${s}T12:00:00`);
    return `${d.getMonth() + 1}/${d.getDate()} (${DAYS[d.getDay()]})`;
  };
  if (!a.ends_at || a.ends_at === a.starts_at) return f(a.starts_at);
  return `${f(a.starts_at)} ~ ${f(a.ends_at)}`;
}

/* ── 목데이터 — Supabase 키가 없을 때 화면만 확인한다 ── */

const iso = (daysAgo: number, hour = 9) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};
const day = (daysAhead: number) => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
};

export const MOCK_ARTICLES: Record<ArticleKind, Article[]> = {
  competition: [
    {
      id: "c1",
      kind: "competition",
      title: "IFSC Climbing World Cup — Boulder",
      summary: "월드컵 볼더 시즌 첫 경기",
      url: "https://www.ifsc-climbing.org/",
      source: "IFSC",
      image_url: null,
      location: "Keqiao, China",
      starts_at: day(3),
      ends_at: day(5),
      published_at: iso(20),
    },
    {
      id: "c2",
      kind: "competition",
      title: "제46회 전국 스포츠클라이밍 선수권대회",
      summary: "아시아선수권 출전선수 선발전",
      url: "https://www.kaf.or.kr/",
      source: "대한산악연맹",
      image_url: null,
      location: "군산클라이밍센터",
      starts_at: day(18),
      ends_at: day(20),
      published_at: iso(12),
    },
    {
      id: "c3",
      kind: "competition",
      title: "○○시장배 전국 스포츠클라이밍 동호인대회 참가 접수",
      summary: "동호인 부문 볼더링 · 리드. 접수는 이달 말까지.",
      url: "https://www.kaf.or.kr/",
      source: "연맹소식",
      image_url: null,
      location: null,
      starts_at: null,
      ends_at: null,
      published_at: iso(1),
    },
  ],
  news: editorial.news.map((article) => ({
    ...article,
    kind: "news",
    location: null,
    starts_at: null,
    ends_at: null,
  })),
};

export const MOCK_POSTS: PostDetail[] = [
  ...notices.map((post): PostDetail => ({
    ...post,
    category: "board",
    topic: "daily",
    nickname: "운영팀",
    photo: null,
    mine: false,
    comments: [],
  })),
  ...editorial.gear.map((post): PostDetail => ({
    ...post,
    category: "gear",
    author_id: editorial.operator_id,
    nickname: "운영팀",
    photo: null,
    created_at: `${editorial.checked_at}T09:00:00+09:00`,
    updated_at: `${editorial.checked_at}T09:00:00+09:00`,
    mine: false,
    comments: [],
  })),
  {
    id: "p1",
    topic: "question",
    title: "성수 쪽 저녁 타임 사람 많나요?",
    body: "퇴근하고 7시쯤 가려는데 평일 저녁 얼마나 붐비는지 궁금해요.\n초보라 사람 많으면 좀 눈치 보여서요 🙈",
    author_id: "u_mina",
    nickname: "미나",
    photo: null,
    created_at: iso(0, 11),
    updated_at: iso(0, 11),
    mine: false,
    comments: [
      {
        id: "cm1",
        author_id: "u_jun",
        nickname: "준호",
        photo: null,
        body: "화·목이 그나마 한산해요. 월·수는 꽉 찹니다",
        created_at: iso(0, 12),
        mine: false,
      },
    ],
  },
  {
    id: "p2",
    topic: "daily",
    title: "첫 V3 완등했습니다!!",
    body: "3주 붙잡고 있던 문제 드디어 풀었어요. 다들 화이팅 💪",
    author_id: "u_me",
    nickname: "나",
    photo: null,
    created_at: iso(1, 21),
    updated_at: iso(1, 21),
    mine: true,
    comments: [],
  },
];

export function mockPostSummaries(category: PostCategory = "board"): PostSummary[] {
  return MOCK_POSTS.filter((p) => !p.video_path && (p.category ?? "board") === category).map((p) => ({
    id: p.id,
    category: p.category ?? "board",
    topic: p.topic ?? "daily",
    pinned_rank: p.pinned_rank ?? null,
    title: p.title,
    preview: p.body.replace(/\s+/g, " ").slice(0, 140),
    author_id: p.author_id,
    nickname: p.nickname,
    photo: p.photo,
    created_at: p.created_at,
    mine: p.mine,
    comment_count: p.comments.length,
  }));
}

export function mockBoardFeed(topic: BoardTopic | null, query: string): BoardFeedPage {
  const normalized = query.trim().slice(0, 80).toLowerCase();
  const rows = mockPostSummaries("board");
  return {
    pinned: rows.filter(p => p.pinned_rank != null).map(p => ({ id: p.id, title: p.title, pinned_rank: p.pinned_rank! }))
      .sort((a, b) => a.pinned_rank - b.pinned_rank),
    items: rows.filter(p => p.pinned_rank == null && (!topic || p.topic === topic) &&
      `${p.title}\n${MOCK_POSTS.find(post => post.id === p.id)?.body ?? ""}`.toLowerCase().includes(normalized)),
  };
}
