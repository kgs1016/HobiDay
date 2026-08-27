/* Supabase 클라이언트 + 데이터 액세스.
   .env.local 에 키가 없으면 null → 화면은 목데이터로 동작(개발 폴백). */

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { CareerId, LevelId } from "./levels";
import type { Session } from "./mock";
import type { MyProfile } from "./myProfile";

let _client: SupabaseClient | null | undefined;

/* 대시보드 [Connect] 가 뱉는 이름은 PUBLISHABLE_KEY 로 바뀌었는데 예전
   프로젝트는 아직 ANON_KEY 다. 이름만 다르고 쓰임은 같아서 둘 다 받는다.
   NEXT_PUBLIC_ 은 빌드 때 문자열로 치환되므로 반드시 통째로 적어야 한다. */
function anonKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}

export function getSupabase(): SupabaseClient | null {
  if (_client !== undefined) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = anonKey();
  _client = url && key ? createClient(url, key) : null;
  return _client;
}

export const hasSupabase = () => getSupabase() !== null;

export async function currentUser(): Promise<User | null> {
  const sb = getSupabase();
  if (!sb) return null;
  // getUser() 는 부를 때마다 서버에 왕복한다 — 거의 모든 화면이 데이터를
  // 받기 전에 이걸 기다려서, 폰(LTE)에서 화면 전환이 눈에 띄게 느렸다.
  // getSession() 은 기기에 저장된 세션을 읽는다(왕복 없음). 진짜 검증은
  // 어차피 모든 데이터 요청에서 RLS 가 토큰으로 한다.
  const { data } = await sb.auth.getSession();
  return data.session?.user ?? null;
}

/** 대시보드에서 켜둔 소셜 로그인만 화면에 노출하기 위한 조회 */
let _providers: string[] | null = null; // 로그인 화면 올 때마다 다시 안 묻게
export async function enabledOAuthProviders(): Promise<string[]> {
  if (_providers) return _providers;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = anonKey();
  if (!url || !key) return [];
  try {
    const r = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    const j = await r.json();
    _providers = Object.entries(j.external ?? {})
      .filter(([k, v]) => v === true && k !== "email" && k !== "phone")
      .map(([k]) => k);
    return _providers;
  } catch {
    return [];
  }
}

/* ── DB 행 → 화면 타입 변환 ── */

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

export interface DbSession {
  id: string;
  gym: string;
  starts_at: string;
  ends_at: string;
  capacity: 1 | 2;
  level_min: LevelId;
  level_max: LevelId;
  age_min: number;
  age_max: number;
  intensity: "chill" | "hard";
  note: string | null;
  status: string;
  m_confirmed: number;
  f_confirmed: number;
  my_status: string | null;
  // 호스트 요약 — 탈퇴한 개설자는 전부 null 로 온다
  host_id: string | null;
  host_nickname: string | null;
  host_photo: string | null;
  host_age: number | null;
  host_area: string | null;
  host_level: LevelId | null;
  // 조기 확정 — 2:2 로 열었지만 성비가 맞는 인원으로 확정하자는 제안
  i_am_host: boolean;
  early_confirm_at: string | null;
  my_ack: boolean;
}

export function toSession(
  r: DbSession,
  myHomeGym?: string,
  /* 내 user id — 호스트 판별용. session_list 가 i_am_host 를 안 내려주는
     (마이그레이션 이전) DB 에서도 host_id 로 판단할 수 있게 받아둔다. */
  myId?: string
): Session & { myStatus: string | null } {
  const st = new Date(r.starts_at);
  const en = new Date(r.ends_at);
  const hm = (d: Date) =>
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return {
    id: r.id,
    gym: r.gym,
    date: `${DAYS[st.getDay()]} ${st.getMonth() + 1}/${st.getDate()}`,
    start: hm(st),
    end: hm(en),
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    capacity: r.capacity,
    levelMin: r.level_min,
    levelMax: r.level_max,
    ageMin: r.age_min,
    ageMax: r.age_max,
    intensity: r.intensity,
    note: r.note ?? undefined,
    maleJoined: Number(r.m_confirmed),
    femaleJoined: Number(r.f_confirmed),
    status: r.status === "open" ? "open" : "confirmed",
    isAway: myHomeGym ? r.gym !== myHomeGym : false,
    myStatus: r.my_status,
    iAmHost: r.i_am_host ?? (!!myId && r.host_id === myId),
    earlyConfirmAt: r.early_confirm_at ?? null,
    myAck: r.my_ack ?? false,
    host: r.host_nickname
      ? {
          id: r.host_id!,
          nickname: r.host_nickname,
          photo: r.host_photo ?? undefined,
          age: r.host_age ?? undefined,
          area: r.host_area ?? undefined,
          level: r.host_level ?? undefined,
        }
      : undefined,
  };
}

/* ── 세션 ── */

export async function fetchSessions(): Promise<DbSession[] | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc("session_list");
  if (error) {
    console.error("session_list", error);
    return null;
  }
  return data as DbSession[];
}

/** 모임 한 건. 목록과 같은 모양이지만 조건이 다르다 — 관계자(호스트·
 *  신청자)는 시작했든 끝났든 취소됐든 언제나 열 수 있다. 참가 취소와
 *  모임 삭제(=환불) 버튼이 상세에만 있어서, 여기가 막히면 낸 크레딧을
 *  돌려받을 길이 없어진다. */
export async function fetchSession(id: string): Promise<DbSession | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc("session_detail", { p_session: id });
  if (error) {
    console.error("session_detail", error);
    return null;
  }
  return (data as DbSession | null) ?? null;
}

/** 모임을 연 사람이 프로필에 적은 것들. 프로필 id 가 아니라 모임 id 로 받는다 */
export interface HostProfile {
  id: string;
  nickname: string;
  gender: "m" | "f";
  age: number;
  area: string;
  level: LevelId;
  career: CareerId | null;
  height: number | null;
  home_gym: string;
  mbti: string | null;
  intro: string | null;
  photo: string | null;
  hosted: number; // 지금까지 연 모임 수
}

export async function fetchSessionHost(
  sessionId: string
): Promise<{ host?: HostProfile; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { error: "no_client" };
  const { data, error } = await sb.rpc("session_host", { p_session: sessionId });
  if (error) {
    console.error("session_host", error);
    return { error: error.message };
  }
  const r = data as (HostProfile & { error?: string }) | null;
  if (!r) return { error: "not_found" };
  if (r.error) return { error: r.error };
  return { host: r };
}

export async function createSession(p: {
  gym: string;
  startsAt: string; // ISO
  endsAt: string;
  capacity: 1 | 2;
  levelMin: LevelId;
  levelMax: LevelId;
  ageMin: number;
  ageMax: number;
  intensity: "chill" | "hard";
  note: string;
}): Promise<{ id?: string; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { error: "no_client" };
  const { data, error } = await sb.rpc("session_create", {
    p_gym: p.gym,
    p_starts_at: p.startsAt,
    p_ends_at: p.endsAt,
    p_capacity: p.capacity,
    p_level_min: p.levelMin,
    p_level_max: p.levelMax,
    p_age_min: p.ageMin,
    p_age_max: p.ageMax,
    p_intensity: p.intensity,
    p_after_meal: false, // 뒤풀이 기능은 접었다 — 컬럼만 남아 있다
    p_note: p.note,
  });
  if (error) return { error: error.message };
  return data as { id?: string; error?: string };
}

export async function joinSession(id: string) {
  const sb = getSupabase();
  if (!sb) return { error: "no_client" };
  const { data, error } = await sb.rpc("session_join", { p_session: id });
  if (error) return { error: error.message };
  // chat_opened — 내 신청으로 정원이 차서 모임 채팅방이 막 열렸다
  return data as {
    status?: string;
    chat_opened?: boolean;
    error?: string;
    cost?: number;
    balance?: number;
  };
}

/** 내가 만든 모임 전부 — 홈 목록과 달리 지난 것·취소한 것도 온다 */
export interface MyHostedSession {
  id: string;
  gym: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  status: "open" | "confirmed" | "cancelled" | "done";
  m_confirmed: number;
  f_confirmed: number;
  waiting: number;
}

export async function fetchMyHostedSessions(): Promise<MyHostedSession[] | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc("my_hosted_sessions");
  if (error) {
    console.error("my_hosted_sessions", error);
    return null;
  }
  return data as MyHostedSession[];
}

/** 매칭 기록 — 성사돼서 이미 끝난 모임만. 호스트로 연 것도, 참가자로
 *  간 것도 함께 온다 (호스트도 확정 signups 행을 갖기 때문). */
export interface MatchMate {
  id: string;
  nickname: string;
  gender: "m" | "f";
  level: number;
  photo: string | null;
  is_host: boolean;
}

export interface MatchRecord {
  id: string;
  gym: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  intensity: "chill" | "hard";
  i_am_host: boolean;
  members: number;
  people: MatchMate[];
}

export async function fetchMatchHistory(): Promise<MatchRecord[] | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc("my_match_history");
  if (error) {
    console.error("my_match_history", error);
    return null;
  }
  return data as MatchRecord[];
}

/** 호스트가 모임을 삭제(취소 표시)한다. 신청비는 서버가 전원 반환.
 *  notify = 알림 보낼 참가자 id 목록 (클라이언트가 push 를 부탁한다) */
export async function deleteSession(id: string) {
  const sb = getSupabase();
  if (!sb) return { error: "no_client" };
  const { data, error } = await sb.rpc("session_delete", { p_session: id });
  if (error) return { error: error.message };
  return data as { ok?: boolean; notify?: string[]; error?: string };
}

/** 참가자가 모임에서 빠진다. 신청비는 언제나 반환 — 정원이 딱 맞아 한 명만
 *  빠져도 모임이 못 열리므로, 나간 사람만 벌주지 않는다 (leave_always_refunds).
 *  cancelled — 내가 빠지면서 확정이 1명이 돼 모임 자체가 취소됐다.
 *  notify    — 그때 남아 있던 사람들 (신청비는 서버가 이미 돌려줬다) */
export async function cancelSignup(id: string) {
  const sb = getSupabase();
  if (!sb) return { error: "no_client" };
  const { data, error } = await sb.rpc("session_cancel", { p_session: id });
  if (error) return { error: error.message };
  return data as {
    ok?: boolean;
    cancelled?: boolean;
    notify?: string[];
    error?: string;
  };
}

/* ── 조기 확정 ──
   2:2 로 열었는데 남 1 · 여 1 에서 멈춘 모임을, 그 인원으로 확정한다.
   호스트가 걸고 게스트가 받아야 성립한다. */

export async function proposeConfirm(id: string) {
  const sb = getSupabase();
  if (!sb) return { error: "no_client" };
  const { data, error } = await sb.rpc("session_propose_confirm", { p_session: id });
  if (error) return { error: error.message };
  // notify — 제안을 받아야 하는 게스트들. 클라이언트가 push 를 부탁한다
  return data as { ok?: boolean; matched?: number; notify?: string[]; error?: string };
}

export async function withdrawConfirm(id: string) {
  const sb = getSupabase();
  if (!sb) return { error: "no_client" };
  const { data, error } = await sb.rpc("session_withdraw_confirm", { p_session: id });
  if (error) return { error: error.message };
  return data as { ok?: boolean; error?: string };
}

export async function acceptConfirm(id: string) {
  const sb = getSupabase();
  if (!sb) return { error: "no_client" };
  const { data, error } = await sb.rpc("session_accept_confirm", { p_session: id });
  if (error) return { error: error.message };
  return data as {
    ok?: boolean;
    confirmed?: boolean;
    capacity?: number;
    waiting?: number;
    /** 확정된 순간 알릴 사람들 (나 제외, 호스트 포함) */
    notify?: string[];
    error?: string;
  };
}

/* ── 신청함 ──
   호스트 승인제 — 신청은 대기로 들어가고 호스트가 받아야 확정된다. */

/** 내가 넣은 신청 */
export interface MySignup {
  id: string;
  gym: string;
  starts_at: string;
  ends_at: string;
  capacity: 1 | 2;
  session_status: string;
  my_status: "waiting" | "confirmed" | "cut";
  host_nickname: string | null;
  host_photo: string | null;
}

/** 내가 연 모임에 온 신청 — 받을지 정하려면 프로필이 보여야 한다 */
export interface HostedRequest {
  session_id: string;
  gym: string;
  starts_at: string;
  capacity: 1 | 2;
  created_at: string;
  user_id: string;
  nickname: string;
  age: number;
  gender: "m" | "f";
  level: LevelId;
  career: CareerId | null;
  height: number | null;
  home_gym: string;
  area: string;
  mbti: string | null;
  intro: string | null;
  photo: string | null;
  same_gender_confirmed: number;
}

/** 호스트가 걸어둔 조기 확정 제안 */
export interface ConfirmProposal {
  session_id: string;
  gym: string;
  starts_at: string;
  capacity: 1 | 2;
  early_confirm_at: string;
  host_nickname: string | null;
  host_photo: string | null;
  matched: number;
}

export async function fetchMySignups() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc("my_signups");
  if (error) return null;
  return data as MySignup[];
}

export async function fetchHostedRequests() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc("my_hosted_requests");
  if (error) return null;
  return data as HostedRequest[];
}

export async function fetchConfirmProposals() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc("my_confirm_proposals");
  if (error) return null;
  return data as ConfirmProposal[];
}

export async function approveSignup(sessionId: string, userId: string) {
  const sb = getSupabase();
  if (!sb) return { error: "no_client" };
  const { data, error } = await sb.rpc("session_approve", {
    p_session: sessionId,
    p_user: userId,
  });
  if (error) return { error: error.message };
  /* chat_opened — 이번 승인으로 확정이 2명이 돼서 방이 막 열렸다
     confirmed   — 이번 승인으로 정원이 다 찼다 (둘은 이제 다른 사건)
     notify      — 알릴 사람 (호스트·방금 승인된 사람 제외) */
  return data as {
    ok?: boolean;
    chat_opened?: boolean;
    confirmed?: boolean;
    notify?: string[];
    error?: string;
  };
}

export async function rejectSignup(sessionId: string, userId: string) {
  const sb = getSupabase();
  if (!sb) return { error: "no_client" };
  const { data, error } = await sb.rpc("session_reject", {
    p_session: sessionId,
    p_user: userId,
  });
  if (error) return { error: error.message };
  return data as { ok?: boolean; error?: string };
}

/* ── 프로필 ── */

export async function fetchMyProfileDb(): Promise<(MyProfile & { isPublic: boolean }) | null> {
  const sb = getSupabase();
  const user = await currentUser();
  if (!sb || !user) return null;
  const { data } = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!data) return null;
  return {
    nickname: data.nickname,
    gender: data.gender,
    age: data.age,
    area: data.area ?? "",
    level: data.level,
    careerId: data.career ?? undefined,
    height: data.height ?? undefined,
    homeGym: data.home_gym ?? "",
    mbti: data.mbti ?? "",
    intro: data.intro ?? undefined,
    photo: data.photo ?? undefined,
    isPublic: data.is_public,
  };
}

export async function upsertMyProfileDb(p: MyProfile, isPublic: boolean) {
  const sb = getSupabase();
  const user = await currentUser();
  if (!sb || !user) return { error: "no_auth" };
  const { error } = await sb.from("profiles").upsert({
    id: user.id,
    nickname: p.nickname,
    gender: p.gender,
    age: p.age,
    area: p.area?.trim() || null, // 선택 항목 — 빈 값은 null 로
    level: p.level,
    career: p.careerId ?? null,
    height: p.height ?? null,
    home_gym: p.homeGym?.trim() || null,
    mbti: p.mbti || null,
    intro: p.intro ?? null,
    photo: p.photo ?? null,
    is_public: isPublic,
  });
  return { error: error?.message };
}

/* ── 모임 진행 (F 화면) ── */

/** 확정된 참가자. 모임 목록은 블라인드지만 확정자끼리는 프로필이 열린다. */
export interface RoomPerson {
  id: string;
  nickname: string;
  age: number;
  gender: "m" | "f";
  level: LevelId;
  career: CareerId | null;
  height: number | null;
  home_gym: string;
  area: string;
  mbti: string;
  intro: string | null;
  photo: string | null;
  is_me: boolean;
}

export interface RoomVideo {
  id: string;
  video_url: string;
  created_at: string;
}

export interface Room {
  session: {
    id: string;
    gym: string;
    starts_at: string;
    ends_at: string;
    capacity: 1 | 2;
    intensity: "chill" | "hard";
    note: string | null;
  };
  me: { id: string; gender: "m" | "f"; level: LevelId };
  /** 성비 기준 확정 인원 — n:n 의 n */
  matched: number;
  people: RoomPerson[];
  videos: RoomVideo[];
  selection_open: boolean;
}

export type RoomError = "no_profile" | "not_found" | "not_confirmed";

export async function fetchRoom(
  id: string
): Promise<{ room?: Room; error?: RoomError | string }> {
  const sb = getSupabase();
  if (!sb) return { error: "no_client" };
  const { data, error } = await sb.rpc("session_room", { p_session: id });
  if (error) return { error: error.message };
  const d = data as Room & { error?: string };
  if (d.error) return { error: d.error };
  return { room: d };
}

/** 영상 경로를 모임에 등록한다 (크레딧은 모임당 1회) */
export async function addSessionVideo(id: string, path: string) {
  const sb = getSupabase();
  if (!sb) return { error: "no_client" };
  const { data, error } = await sb.rpc("session_video_add", {
    p_session: id,
    p_video: path,
  });
  if (error) return { error: error.message };
  return data as { ok?: boolean; error?: string; earned?: number; balance?: number };
}

export async function deleteSessionVideo(videoId: string) {
  const sb = getSupabase();
  if (!sb) return;
  await sb.rpc("session_video_delete", { p_video: videoId });
}

export async function submitSelection(id: string, chosen: string[]) {
  const sb = getSupabase();
  if (!sb) return { error: "no_client" };
  const { data, error } = await sb.rpc("selection_submit", {
    p_session: id,
    p_chosen: chosen,
  });
  if (error) return { error: error.message };
  return data as { ok?: boolean; count?: number; error?: string };
}

/** 상호선택된 상대만 내려온다. 짝사랑은 서버가 아예 보내지 않는다. */
export async function fetchMatches(id: string) {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc("my_matches", { p_session: id });
  if (error) return null;
  return data as {
    id: string;
    nickname: string;
    age: number;
    level: LevelId;
    career: CareerId | null;
    home_gym: string;
    area: string;
    mbti: string;
    intro: string | null;
  }[];
}

/* ── 미션 영상 (Storage) ── */

const VIDEO_BUCKET = "mission-videos";
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024; // 버킷 설정과 같은 값

/** 경로 규칙: {user_id}/{session_id}/{시각}.{확장자}
 *  첫 폴더가 업로더 uuid 라서 스토리지 정책이 남의 칸 쓰기를 막는다.
 *  한 모임에 여러 개 올릴 수 있어야 하므로 파일명에 시각을 넣는다. */
export async function uploadSessionVideo(
  sessionId: string,
  file: File
): Promise<{ path?: string; error?: string }> {
  const sb = getSupabase();
  const user = await currentUser();
  if (!sb || !user) return { error: "no_auth" };
  if (file.size > VIDEO_MAX_BYTES) return { error: "too_large" };

  const ext = file.name.split(".").pop()?.toLowerCase() || "mp4";
  const path = `${user.id}/${sessionId}/${Date.now()}.${ext}`;

  const { error } = await sb.storage
    .from(VIDEO_BUCKET)
    .upload(path, file, { contentType: file.type || undefined });
  if (error) return { error: error.message };
  return { path };
}

/** 비공개 버킷이라 재생은 서명 URL 로만 된다 (기본 1시간) */
export async function signedVideoUrl(path: string, seconds = 3600) {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.storage.from(VIDEO_BUCKET).createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}

export async function fetchMyVideos() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc("my_videos");
  if (error) return null;
  return data as {
    id: string;
    session_id: string;
    video_url: string;
    created_at: string;
    gym: string;
    starts_at: string;
  }[];
}

/* ── 채팅 ── */

export interface Chat {
  match_id: string;
  /** 관심 수락으로 생긴 방은 모임이 없어서 null */
  session_id: string | null;
  gym: string | null;
  partner_id: string;
  nickname: string;
  age: number;
  level: LevelId;
  home_gym: string;
  photo: string | null;
  /** 상대가 나갔다 — 방은 남지만 더 보낼 수는 없다 */
  partner_left?: boolean;
  last_body: string | null;
  last_at: string;
  unread: number;
}

export interface ChatMessage {
  id: number;
  /** system = "○○님이 나갔어요" 같은 안내. 말풍선이 아니라 가운데 한 줄 */
  kind?: "user" | "system";
  sender_id: string;
  body: string;
  created_at: string;
  mine: boolean;
}

export async function fetchChats() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc("my_chats");
  if (error) return null;
  return data as Chat[];
}

export async function fetchChatMessages(matchId: string) {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc("chat_messages", { p_match: matchId });
  if (error) return null;
  const d = data as ChatMessage[] | { error: string };
  if (!Array.isArray(d)) return null;
  return d;
}

export async function sendChat(matchId: string, body: string) {
  const sb = getSupabase();
  if (!sb) return { error: "no_client" };
  const { data, error } = await sb.rpc("chat_send", {
    p_match: matchId,
    p_body: body,
  });
  if (error) return { error: error.message };
  return data as { ok?: boolean; error?: string };
}

/** 1:1 방 나가기 — 방이 양쪽 모두에게서 사라진다 (대화 기록은 서버에 남는다) */
export async function leaveChat(matchId: string) {
  const sb = getSupabase();
  if (!sb) return { error: "no_client" };
  const { data, error } = await sb.rpc("chat_leave", { p_match: matchId });
  if (error) return { error: error.message };
  return data as { ok?: boolean; error?: string };
}

/* ── 프로필 사진 ── */

const PHOTO_BUCKET = "profile-photos";
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

export async function uploadProfilePhoto(
  file: File
): Promise<{ path?: string; error?: string }> {
  const sb = getSupabase();
  const user = await currentUser();
  if (!sb || !user) return { error: "no_auth" };
  if (file.size > PHOTO_MAX_BYTES) return { error: "too_large" };

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${user.id}/avatar.${ext}`;
  const { error } = await sb.storage
    .from(PHOTO_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type || undefined });
  if (error) return { error: error.message };
  return { path };
}

/** 비공개 버킷이라 표시도 서명 URL 로만 된다. 목록은 한 번에 받아온다.
 *
 *  발급받은 주소는 유효기간 동안 재사용한다 — 매번 새로 발급하면 주소가
 *  달라져서 브라우저가 같은 사진을 캐시하지 못하고, 화면에 올 때마다
 *  전부 다시 내려받는다 (폰에서 사진이 느리던 주범). */
const _photoUrlCache = new Map<string, { url: string; exp: number }>();

export async function signedPhotoUrls(
  paths: string[],
  seconds = 3600
): Promise<Record<string, string>> {
  const sb = getSupabase();
  const uniq = [...new Set(paths.filter(Boolean))];
  if (!sb || uniq.length === 0) return {};

  const now = Date.now();
  const out: Record<string, string> = {};
  const need: string[] = [];
  for (const p of uniq) {
    const c = _photoUrlCache.get(p);
    if (c && c.exp > now) out[p] = c.url;
    else need.push(p);
  }
  if (need.length === 0) return out;

  const { data } = await sb.storage.from(PHOTO_BUCKET).createSignedUrls(need, seconds);
  // 만료 5분 전까지만 재사용 — 화면에 뜬 채로 만료되는 걸 피한다
  const exp = now + (seconds - 300) * 1000;
  for (const d of data ?? []) {
    if (d.path && d.signedUrl) {
      out[d.path] = d.signedUrl;
      _photoUrlCache.set(d.path, { url: d.signedUrl, exp });
    }
  }
  return out;
}

/* ── 회원 탈퇴 ── */

/** 스토리지 목록은 한 단계씩만 준다. 영상 경로가 {uid}/{session}/{파일} 이라
 *  폴더를 만나면 한 번 더 들어가야 한다. 폴더는 id 가 null 로 온다. */
async function listAllPaths(bucket: string, prefix: string): Promise<string[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error || !data) return [];

  const out: string[] = [];
  for (const f of data) {
    const path = `${prefix}/${f.name}`;
    if (f.id === null) out.push(...(await listAllPaths(bucket, path)));
    else out.push(path);
  }
  return out;
}

/** 탈퇴.
 *
 *  순서가 중요하다 — 스토리지(사진·영상)는 DB 밖에 있어 계정을 지워도
 *  같이 지워지지 않는다. 그런데 계정을 먼저 지우면 로그인이 끊겨
 *  파일을 지울 권한이 사라진다. 그래서 파일 → 계정 순으로 지운다.
 *
 *  나머지(프로필·신청·매칭·메시지·크레딧)는 DB 의 cascade 가 처리한다. */
export async function deleteAccount(): Promise<{ ok?: true; error?: string }> {
  const sb = getSupabase();
  const user = await currentUser();
  if (!sb || !user) return { error: "no_auth" };

  for (const bucket of [PHOTO_BUCKET, VIDEO_BUCKET]) {
    const paths = await listAllPaths(bucket, user.id);
    // remove 는 한 번에 여러 개를 받지만 너무 많으면 요청이 커진다
    for (let i = 0; i < paths.length; i += 100) {
      await sb.storage.from(bucket).remove(paths.slice(i, i + 100));
    }
  }

  const { data, error } = await sb.rpc("account_delete");
  if (error) return { error: error.message };
  const r = data as { ok?: boolean; error?: string };
  if (r?.error) return { error: r.error };

  await sb.auth.signOut();
  return { ok: true };
}

/* ── 오픈 전 잠금 · 선착순 ── */

export interface AppFlags {
  sessions_open: boolean;
  people_open: boolean;
  open_at: string | null;
  notice: string | null;
  /** 내부 테스터 — 잠겨 있어도 서버가 열린 값을 내려준다 */
  tester?: boolean;
}

/* 홈·게이트·하단 탭이 화면마다 읽는다 — 값은 거의 안 바뀌니 잠깐 재사용.
   테스터 여부가 로그인에 따라 달라지므로 사용자별로 캐시한다. */
let _flagsCache: { uid: string | null; flags: AppFlags; exp: number } | null = null;

/** 로그인 없이도 읽힌다 (플래그·집계뿐) */
export async function fetchAppFlags() {
  const sb = getSupabase();
  if (!sb) return null;
  const uid = (await currentUser())?.id ?? null; // getSession — 서버 왕복 없음
  if (_flagsCache && _flagsCache.exp > Date.now() && _flagsCache.uid === uid)
    return _flagsCache.flags;
  const { data, error } = await sb.rpc("app_flags");
  if (error) return null;
  _flagsCache = { uid, flags: data as AppFlags, exp: Date.now() + 5 * 60_000 };
  return data as AppFlags;
}

export async function fetchEarlyBird() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc("early_bird_status");
  if (error) return null;
  return data as { slots: number; taken_m: number; taken_f: number };
}

/* ── 크레딧 ── */

export const CREDIT_LABELS: Record<string, string> = {
  session_video: "🎥 등반 영상",
  profile_complete: "🧗 프로필 완성",
  early_bird: "🎁 사전 가입 혜택",
  request_extra: "💌 관심 보내기",
  request_refund: "↩️ 관심 반환",
  session_join: "🧗 모임 신청",
  session_refund: "↩️ 모임 신청 반환",
  admin_grant: "🛠 운영자 지급",
  // 아래 둘은 로테이션 시절 적립. 지난 원장을 읽으려면 이름이 필요하다.
  mission_video: "🎥 영상 미션",
  mission_done: "✅ 미션 완료",
};

/* 표시용 금액 — 서버 credit_rule() 과 같은 값이어야 한다.
   실제 적립·차감은 전부 서버가 하고, 여기 값은 안내 문구에만 쓴다.
   ⚠️ SQL 의 credit_rule 을 바꾸면 여기도 같이 바꿀 것. */
export const REQUEST_COST = 10; // request_extra
export const SESSION_JOIN_COST = 10; // session_join — 모임이 취소되거나 내가 나가면 반환
export const CREDIT_SESSION_VIDEO = 2; // session_video (모임당 1회)

export interface Credits {
  balance: number;
  history: { delta: number; reason: string; created_at: string }[];
}

export async function fetchCredits() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc("my_credits");
  if (error) return null;
  return data as Credits;
}

/** 프로필을 처음 완성했을 때 한 번 적립된다 (중복 호출은 서버가 무시) */
export async function claimProfileBonus() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc("claim_profile_bonus");
  if (error) return null;
  return data as { ok?: boolean; earned?: number; balance?: number; error?: string };
}

/* ── 관심 보내기 ── */

export interface ReceivedRequest {
  id: string;
  message: string | null;
  created_at: string;
  from_id: string;
  nickname: string;
  age: number;
  level: LevelId;
  career: CareerId | null;
  height: number | null;
  home_gym: string;
  area: string;
  mbti: string;
  intro: string | null;
  photo: string | null;
}

export interface SentRequest {
  id: string;
  created_at: string;
  status: "pending" | "accepted";
  to_id: string;
  nickname: string;
  age: number;
  level: LevelId;
  home_gym: string;
}

export async function sendRequest(toId: string, message?: string) {
  const sb = getSupabase();
  if (!sb) return { error: "no_client" };
  const { data, error } = await sb.rpc("request_send", {
    p_to: toId,
    p_message: message ?? null,
  });
  if (error) return { error: error.message };
  return data as {
    ok?: boolean;
    left?: number;
    error?: string;
    status?: string;
    limit?: number;
    /** 하루 한도를 넘겨 크레딧으로 보냈는지 */
    spent?: boolean;
    cost?: number;
    balance?: number;
  };
}

export async function fetchReceivedRequests() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc("requests_received");
  if (error) return null;
  return data as ReceivedRequest[];
}

export async function fetchSentRequests() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc("requests_sent");
  if (error) return null;
  return data as SentRequest[];
}

export async function respondRequest(id: string, accept: boolean) {
  const sb = getSupabase();
  if (!sb) return { error: "no_client" };
  const { data, error } = await sb.rpc("request_respond", {
    p_request: id,
    p_accept: accept,
  });
  if (error) return { error: error.message };
  return data as {
    ok?: boolean;
    accepted?: boolean;
    match_id?: string;
    error?: string;
  };
}

export async function fetchInboxCounts() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc("inbox_counts");
  if (error) return null;
  return data as {
    /** 신청함 배지 = 내가 답해야 하는 것들의 합 (관심 + 모임 신청 + 확정 제안) */
    requests: number;
    likes: number;
    hosted: number;
    proposals: number;
    sent_today: number;
    daily_limit: number;
    unread_messages: number;
    unread_rooms: number;
  };
}

/** 방을 열면 호출 — 이 시점 이후 메시지만 안 읽음으로 센다 */
export async function markChatRead(matchId: string) {
  const sb = getSupabase();
  if (!sb) return;
  await sb.rpc("chat_mark_read", { p_match: matchId });
}

/* ── 모임 단체 채팅 ──
   1:1 과 달리 모임 자체가 방이라 match_id 가 아니라 session_id 로 다룬다. */

export interface SessionChat {
  session_id: string;
  gym: string;
  starts_at: string;
  /** 방이 닫히는 기준 — 끝나거나 취소되고 24시간 뒤 */
  ends_at: string;
  status: "open" | "confirmed" | "cancelled" | "done";
  cancelled_at: string | null;
  capacity: 1 | 2;
  members: number;
  last_body: string | null;
  last_at: string;
  unread: number;
}

export interface SessionChatMessage extends ChatMessage {
  sender_name: string | null;
  sender_photo: string | null;
  sender_is_host: boolean;
}

export async function fetchSessionChats() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc("my_session_chats");
  if (error) return null;
  return data as SessionChat[];
}

export async function fetchSessionChatMessages(sessionId: string) {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc("session_chat_messages", {
    p_session: sessionId,
  });
  if (error) return null;
  const d = data as SessionChatMessage[] | { error: string };
  if (!Array.isArray(d)) return null;
  return d;
}

export async function sendSessionChat(sessionId: string, body: string) {
  const sb = getSupabase();
  if (!sb) return { error: "no_client" };
  const { data, error } = await sb.rpc("session_chat_send", {
    p_session: sessionId,
    p_body: body,
  });
  if (error) return { error: error.message };
  // notify — 나 빼고 확정자 전원. 클라이언트가 push 를 부탁한다
  return data as { ok?: boolean; notify?: string[]; error?: string };
}

export async function markSessionChatRead(sessionId: string) {
  const sb = getSupabase();
  if (!sb) return;
  await sb.rpc("session_chat_mark_read", { p_session: sessionId });
}

/* ── 프로필 목록 ── */

/**
 * 사람 찾기 목록.
 * @param me 내 프로필 — 나 자신과 동성은 목록에서 뺀다. 관심은 이성에게만
 *   보낼 수 있고(request_send 가 self · same_gender 로 막는다), 보낼 수 없는
 *   카드를 늘어놓으면 누를 때까지 알 수 없다. 서버에서 걸러 아예 받지 않는다.
 */
export async function fetchPeople(me?: { id: string; gender: "m" | "f" }) {
  const sb = getSupabase();
  if (!sb) return null;
  let q = sb
    .from("profiles")
    .select(
      "id, nickname, age, gender, level, career, height, home_gym, mbti, area, intro, photo"
    )
    .eq("is_public", true)
    // 사진 없는 카드는 목록에 넣지 않는다 (DB 제약과 이중으로)
    .not("photo", "is", null);

  if (me) q = q.neq("id", me.id).eq("gender", me.gender === "m" ? "f" : "m");

  const { data, error } = await q
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return null;
  return data.map((d) => ({
    id: d.id as string,
    nickname: d.nickname as string,
    age: d.age as number,
    gender: d.gender as "m" | "f",
    level: d.level as LevelId,
    careerId: (d.career ?? undefined) as CareerId | undefined,
    height: (d.height ?? undefined) as number | undefined,
    homeGym: d.home_gym as string,
    mbti: (d.mbti ?? "") as string,
    area: d.area as string,
    intro: (d.intro ?? undefined) as string | undefined,
    photo: (d.photo ?? undefined) as string | undefined,
  }));
}

/* ── 신고 · 차단 ── */

/** DB 의 reports.reason 체크 제약과 같은 값이어야 한다 */
export const REPORT_REASONS = [
  { id: "abuse", label: "욕설·괴롭힘", hint: "모욕적인 말, 집요한 연락" },
  { id: "sexual", label: "성적 불쾌감", hint: "원치 않는 성적 대화·사진" },
  { id: "fake", label: "사진·정보가 달라요", hint: "다른 사람 사진, 거짓 프로필" },
  { id: "commercial", label: "광고·영업", hint: "홍보, 다른 앱 유도, 금전 요구" },
  { id: "noshow", label: "모임에 안 나왔어요", hint: "약속한 모임 노쇼" },
  { id: "other", label: "그 밖의 문제", hint: "" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["id"];
export type ReportContext = "profile" | "chat" | "session";

/** 신고하면 차단까지 함께 걸린다 (서버에서 처리) */
export async function reportUser(
  targetId: string,
  reason: ReportReason,
  detail?: string,
  context: ReportContext = "profile",
  refId?: string
) {
  const sb = getSupabase();
  if (!sb) return { error: "no_client" };
  const { data, error } = await sb.rpc("report_user", {
    p_target: targetId,
    p_reason: reason,
    p_detail: detail ?? null,
    p_context: context,
    p_ref: refId ?? null,
  });
  if (error) return { error: error.message };
  return data as { ok?: boolean; error?: string };
}

export async function blockUser(targetId: string) {
  const sb = getSupabase();
  if (!sb) return { error: "no_client" };
  const { data, error } = await sb.rpc("block_user", { p_target: targetId });
  if (error) return { error: error.message };
  return data as { ok?: boolean; error?: string };
}

export async function unblockUser(targetId: string) {
  const sb = getSupabase();
  if (!sb) return { error: "no_client" };
  const { data, error } = await sb.rpc("unblock_user", { p_target: targetId });
  if (error) return { error: error.message };
  return data as { ok?: boolean; error?: string };
}

export interface BlockedPerson {
  blocked_id: string;
  created_at: string;
  nickname: string;
  age: number;
  home_gym: string;
}

export async function fetchMyBlocks() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc("my_blocks");
  if (error) return null;
  return data as BlockedPerson[];
}
