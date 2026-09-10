import { currentUser, fetchMyProfileDb, hasSupabase } from './supabase';
import { loadMyProfile } from './myProfile';
import { fetchClimbingProgress } from './climbingAscents';
import { isBasicProfileComplete } from './profileGate';

export const PROFILE_REQUIRED_MESSAGE = '프로필을 완성해주세요';
const RETURN_PATHS = new Set(['/', '/session', '/session/new', '/user', '/community/write', '/community/post',
  '/videos/upload', '/videos/post', '/chat', '/inbox', '/review', '/me', '/me/reviews', '/user/reviews']);
export function safeParticipationReturn(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 2048 || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null;
  try {
    const url = new URL(raw, 'https://hobiday.invalid');
    if (url.origin !== 'https://hobiday.invalid' || !RETURN_PATHS.has(url.pathname.replace(/\/$/, '') || '/')) return null;
    return url.pathname + url.search + url.hash;
  } catch { return null; }
}
export function participationReturn(): string {
  return safeParticipationReturn(window.location.pathname + window.location.search + window.location.hash) ?? '/';
}
export function participationProfileHref(returnTo: string): string {
  return '/profile/new?returnTo=' + encodeURIComponent(safeParticipationReturn(returnTo) ?? '/');
}
export type ParticipationRouter = { push: (url: string) => void };

/** 읽기 실패와 미완성을 구분하며, 이 검사 결과로 참여 요청을 자동 실행하지 않는다. */
export async function requireParticipationProfile(router: ParticipationRouter, returnTo?: string, signal?: AbortSignal): Promise<boolean> {
  try {
    await Promise.resolve();
    if (signal?.aborted) return false;
    if (hasSupabase() && !(await currentUser())) {
      if (signal?.aborted) return false;
      alert('로그인이 필요해요'); router.push('/login'); return false;
    }
    const profile = hasSupabase() ? await fetchMyProfileDb() : loadMyProfile();
    if (signal?.aborted) return false;
    if (hasSupabase() && !profile) throw new Error('profile_unavailable');
    if (isBasicProfileComplete(profile)) {
      const progress = await fetchClimbingProgress();
      if (signal?.aborted) return false;
      if (progress.starting_shoe) return true;
      alert(PROFILE_REQUIRED_MESSAGE);
      router.push('/profile/shoe?returnTo=' + encodeURIComponent(safeParticipationReturn(returnTo ?? participationReturn()) ?? '/'));
      return false;
    }
    alert(PROFILE_REQUIRED_MESSAGE);
    router.push(participationProfileHref(returnTo ?? participationReturn()));
  } catch { if (!signal?.aborted) alert('회원 정보를 확인하지 못했어요. 다시 시도해주세요'); }
  return false;
}

/** SQL 검증에서 거절된 경우에도 같은 안내로 복귀 경로를 유지한다. */
export function handleParticipationError(error: string | undefined, router: ParticipationRouter, returnTo?: string): boolean {
  if (!error?.includes('profile_incomplete')) return false;
  alert(PROFILE_REQUIRED_MESSAGE);
  router.push(participationProfileHref(returnTo ?? participationReturn()));
  return true;
}

const PREFIX = 'hobiday.participationDraft.';
export async function participationDraftKey(key: string): Promise<string | null> {
  const uid = hasSupabase() ? (await currentUser())?.id : 'local-preview';
  return uid ? PREFIX + uid + '.' + key : null;
}
export function readParticipationDraft(key: string): string | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (typeof draft.value !== 'string' || typeof draft.expires !== 'number' || draft.expires < Date.now()) {
      sessionStorage.removeItem(key); return null;
    }
    return draft.value;
  } catch { return null; }
}
export function writeParticipationDraft(key: string, value: string): void {
  try {
    if (!value) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify({value, expires: Date.now() + 30 * 60 * 1000}));
  } catch { /* 저장소를 사용할 수 없어도 입력과 참여 검사는 계속 동작한다. */ }
}
