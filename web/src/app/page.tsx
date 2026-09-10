"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import HomeSessionList from "@/components/HomeSessionList";
import SessionFilterBar from "@/components/SessionFilterBar";
import HomeBanner from "@/components/HomeBanner";
import LoadErrorNotice from "@/components/LoadErrorNotice";
import { ShoeBadge } from "@/components/PublicShoe";
import ChatRequestSheet from "@/components/ChatRequestSheet";
import { AvatarFallback, BellIcon, MailIcon, PlusIcon, SearchIcon } from "@/components/icons";
import { ShoeIllust } from "@/components/illustrations";
import { MOCK_SESSIONS, MOCK_PEOPLE, type Session, type Person } from "@/lib/mock";
import { level } from "@/lib/levels";
import { visitFrequencyLabel } from "@/lib/visitFrequency";
import { MOCK_GYMS } from "@/lib/meetupOptions";
import {
  EMPTY_FILTER,
  applySessionFilter,
} from "@/lib/sessionFilter";
import { findGym, matchesSearch, matchesSessionPlace } from "@/lib/homeSearch";
import { loadMyProfile, type MyProfile } from "@/lib/myProfile";
import { startPolling } from "@/lib/polling";
import { fetchHomeLists } from "@/lib/homeLists";
import {
  hasSupabase,
  currentUser,
  fetchMyProfileDb,
  fetchGyms,
  type Gym,
  fetchNotifications,
  fetchInboxCounts,
  fetchSentRequests,
  signedPhotoUrls,
  toSession,
} from "@/lib/supabase";
import type { GymOption } from "@/components/SessionFilterBar";

export default function Home() {
  const router = useRouter();
  // Supabase 키가 없을 때만 목데이터로 화면을 본다 (개발 폴백).
  // 실제 배포에선 목데이터를 초기값으로 두면 안 된다 — 확인이 끝나기 전에
  // 존재하지 않는 모임이 1초쯤 그려진다.
  const mockMode = !hasSupabase();
  const [tab, setTab] = useState<"session" | "people">("session");
  const [me, setMe] = useState<MyProfile | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [ready, setReady] = useState(mockMode);
  const [loading, setLoading] = useState(!mockMode);
  const [homeError, setHomeError] = useState(false);
  const [sessionError, setSessionError] = useState(false);
  const [peopleError, setPeopleError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const retrying = useRef(false);
  const [sessions, setSessions] = useState<Session[]>(mockMode ? MOCK_SESSIONS : []);
  const [people, setPeople] = useState<(Person & { intro?: string })[]>(
    mockMode ? MOCK_PEOPLE : []
  );
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const searchButton = useRef<HTMLButtonElement>(null);
  // Gym Master — 짐 필터의 검색 대상. 못 받으면(mock·마이그레이션 전) 폴백
  const [masterGyms, setMasterGyms] = useState<Gym[] | null>(null);
  // 모임 찾기 필터 — 서버를 다시 부르지 않고 받아온 목록에서 거른다
  const [filter, setFilter] = useState(EMPTY_FILTER);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  // 대화신청
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  // 종 아이콘 배지 — 안 읽은 알림 수만 쓴다
  const [unread, setUnread] = useState(0);
  const [requests, setRequests] = useState(0);
  const [reqTarget, setReqTarget] = useState<Person | null>(null);

  const retry = () => {
    if (retrying.current) return;
    retrying.current = true;
    setLoading(true);
    setLoadAttempt(attempt => attempt + 1);
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      // 브라우저 주소는 최초 hydration을 마친 뒤 확인한다.
      await Promise.resolve();
      if (!alive) return;
      if (loadAttempt === 0 && window.location.hash === "#people") setTab("people");
      if (!hasSupabase()) {
        setMe(loadMyProfile());
        setAuthed(null);
        return;
      }
      const user = await currentUser();
      if (!alive) return;
      setAuthed(!!user);

      // 비로그인은 DB가 아무것도 안 내려준다. 목데이터가 실제 모임처럼
      // 보이는 걸 막으려고 조회 자체를 하지 않는다.
      if (!user) {
        setHomeError(false);
        router.replace("/login");
        return;
      }

      // 프로필 입력 여부와 무관하게 로그인한 회원은 이용한다.
      const prof = await fetchMyProfileDb();
      if (!alive) return;
      setMe(prof);

      setHomeError(false);

      // 사진·장소 필터·배지 실패는 모임 목록 조회와 별개로 처리한다.
      void fetchGyms().then(gymRows => { if (alive && gymRows) setMasterGyms(gymRows); }).catch(() => {});
      void fetchSentRequests().then(sent => { if (alive && sent) setSentTo(new Set(sent.map(s => s.to_id))); }).catch(() => {});
      void fetchNotifications().then(notis => { if (alive && notis) setUnread(notis.unread); }).catch(() => {});

      // 사람 찾기는 성별로 거르지 않는다 — 내 카드만 뺀다
      const { sessions: rows, people: ppl } = await fetchHomeLists(user.id);
      if (!alive) return;
      setSessionError(rows === null);
      setPeopleError(ppl === null);
      if (rows !== null) {
        setSessions(rows.map((r) => toSession(r, prof?.homeGym, user.id)));
      }
      // 비공개 버킷이라 표시용 서명 URL 을 한 번에 받아온다.
      // 사람 목록과 모임 호스트를 같이 넣어야 요청이 한 번으로 끝난다.
      const paths = [
        ...(ppl ?? []).map((x) => x.photo),
        ...(rows ?? []).map((r) => r.host_photo),
        prof?.photo, // "내 프로필 (공개 중)" 줄 — 빼먹으면 내 사진만 비어 뜬다
      ].filter(Boolean) as string[];
      if (ppl !== null) setPeople(ppl);
      if (paths.length > 0) void signedPhotoUrls(paths).then(urls => {
        if (alive) setPhotoUrls(previous => ({ ...previous, ...urls }));
      }).catch(() => {});
    })().catch(() => { if (alive) setHomeError(true); }).finally(() => {
      if (!alive) return;
      setLoading(false);
      setReady(true);
      retrying.current = false;
    });
    return () => { alive = false; };
  }, [loadAttempt, router]);

  // 하단 신청함에 있던 확인 필요 배지를 편지 아이콘에서도 갱신한다.
  useEffect(() => {
    if (!authed) return;
    const poller = startPolling(async signal => {
      const inbox = await fetchInboxCounts();
      if (!signal.aborted && inbox) setRequests(inbox.requests);
    }, 30_000);
    return () => poller.stop();
  }, [authed]);

  if (homeError) return <main className="px-4 pt-20">
    <LoadErrorNotice message="홈 화면을 불러오지 못했어요" loading={loading} onRetry={retry} />
  </main>;

  // 로그인 화면으로 이동하는 동안 중간 안내나 빈 모임 목록을 표시하지 않는다.
  if (authed === false) return null;

  // 아직 조회가 끝나지 않은 상태.
  // 여기서 목록을 그리면 빈 목록이나 목데이터가 잠깐 보인다.
  if (!ready) {
    return (
      <main className="px-4 pt-28 text-center">
        <p className="text-[13.5px] text-faint">불러오는 중…</p>
      </main>
    );
  }

  /* 필터의 짐 목록은 master 전체를 보여준다. 짐으로 거르는 이유는 "내가
     갈 수 있는 곳" 을 정하는 것이라, 오늘 모임이 없다고 선택지에서 빠지면
     오히려 이상하다. master 를 못 받는 환경(mock·마이그레이션 전)에서는
     폴백 목록으로, master 에 없는 이름의 legacy 모임은 뒤에 붙인다. */
  const baseOpts: GymOption[] = masterGyms?.length
    ? masterGyms.map((g) => ({
        name: g.name,
        region: g.region,
        city_district: g.city_district,
        brand: g.brand,
        aliases: g.aliases,
      }))
    : MOCK_GYMS.map((name) => ({ name }));
  /* 별칭까지 아는 이름으로 친다. master 가 "더클라임 B홍대점" 의 옛 이름을
     알고 있는데도 "더클라임 B홍대" 로 열린 모임을 뒤에 또 붙이면, 같은
     클라이밍장이 목록에 두 줄로 앉는다. */
  const knownNames = new Set(
    baseOpts.flatMap((o) => [o.name, ...(o.aliases ?? [])])
  );
  const gymChoices: GymOption[] = [
    ...baseOpts,
    ...Array.from(new Set(sessions.map((s) => s.gym)))
      .filter((g) => !knownNames.has(g))
      .sort()
      .map((name) => ({ name })),
  ];
  const resetSearch = () => { setFilter(EMPTY_FILTER); setQuery(""); };
  const closeSearch = () => {
    setSearchOpen(false);
    setQuery("");
    searchButton.current?.focus();
  };
  const shown = applySessionFilter(sessions, filter).filter(session => matchesSessionPlace(query, session, gymChoices));
  const shownPeople = people.filter(person => {
    const gym = findGym(gymChoices, person.homeGym);
    return matchesSearch(query, [person.nickname, person.homeGym, person.area, person.intro, ...(gym?.aliases ?? [])]);
  });

  return (
    <main className="px-4">
      <header className="flex items-center justify-between gap-3 pt-5 pb-3">
        <p className="shrink-0 text-[16px] font-bold tracking-[1.5px] text-accent">HOBIDAY</p>
        <div className="flex items-center gap-1">
          <button ref={searchButton} type="button" aria-label="검색" aria-expanded={searchOpen} aria-controls="home-search"
            onClick={() => searchOpen ? closeSearch() : setSearchOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-ink active:bg-surface2">
            <SearchIcon size={21} />
          </button>
          <Link href="/notifications" aria-label={unread ? `알림 ${unread}개 안 읽음` : "알림"}
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-ink active:bg-surface2">
            <BellIcon size={21} />
            {unread > 0 && <span aria-hidden="true" className="absolute right-0 top-0 min-w-[15px] rounded-full bg-danger px-1 text-center text-[9.5px] font-bold leading-[15px] text-white">
              {unread > 99 ? "99+" : unread}
            </span>}
          </Link>
          <Link href="/inbox" aria-label={requests ? `신청 내역 ${requests}개 확인 필요` : "신청 내역"}
            className="relative -mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-ink active:bg-surface2">
            <MailIcon size={21} />
            {requests > 0 && <span aria-hidden="true" className="absolute right-0 top-0 min-w-[15px] rounded-full bg-danger px-1 text-center text-[9.5px] font-bold leading-[15px] text-white">
              {requests > 99 ? "99+" : requests}
            </span>}
          </Link>
        </div>
      </header>

      {searchOpen && <form id="home-search" role="search" className="mb-3 flex items-center gap-2"
        onSubmit={e => { e.preventDefault(); searchInput.current?.blur(); }}>
        <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-lg bg-surface2 px-3">
          <SearchIcon size={17} className="shrink-0 text-muted" />
          <input ref={searchInput} autoFocus type="search" value={query} onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === "Escape") closeSearch(); }}
            aria-label={tab === "session" ? "장소 검색" : "사람 검색"}
            placeholder={tab === "session" ? "클라이밍장 이름 · 지역 검색" : "닉네임, 홈 클라이밍장 검색"}
            className="h-full min-w-0 w-full bg-transparent text-[16px] outline-none placeholder:text-faint" />
        </div>
        <button type="button" onClick={closeSearch} className="min-h-11 px-1 text-[13px] font-medium text-muted">취소</button>
      </form>}

      <div className="flex items-center justify-between gap-3 border-b border-line">
        <div className="flex gap-6" aria-label="둘러보기">
          {([["session", "모임"], ["people", "사람"]] as const).map(([key, label]) => (
            <button key={key} type="button" aria-pressed={tab === key} onClick={() => setTab(key)}
              className={`-mb-px min-h-12 border-b-2 pb-2.5 pt-1 text-[21px] font-bold tracking-tight ${tab === key ? "border-ink text-ink" : "border-transparent text-faint"}`}>
              {label}
            </button>
          ))}
        </div>
        <Link href="/session/new" className="button-secondary mb-2 flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold">
          <PlusIcon size={14} strokeWidth={2.2} />모임 만들기
        </Link>
      </div>

      <HomeBanner />

      {tab === "session" ? (
        <>
          <SessionFilterBar
            value={filter}
            onChange={setFilter}
            gyms={gymChoices}
          />

          {mockMode && <p className="mt-3 rounded-lg bg-surface2 px-4 py-2.5 text-center text-[11.5px] text-faint">
            미리보기 데이터예요 · Supabase 연결 후 실제 모임이 표시됩니다
          </p>}
          {query.trim() && !sessionError && !loading && <p role="status" className="pt-3 text-[12px] text-muted">검색 결과 {shown.length}개</p>}

          <HomeSessionList sessions={sessions} shown={shown} error={sessionError} loading={loading}
            photoUrls={photoUrls} onRetry={retry} onReset={resetSearch} />
        </>
      ) : (
        <div className="pb-6">
          {mockMode && <p className="mt-3 rounded-lg bg-surface2 px-4 py-2.5 text-center text-[11.5px] text-faint">미리보기 데이터 · 클라이밍화 성취도 예시예요</p>}
          {/* 내 공개 설정 — 비공개 프로필도 본인에게만 상태를 보여준다. */}
          {me ? (
            <div className="flex items-center gap-3.5 border-b border-line py-4">
              {me.photo && photoUrls[me.photo] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoUrls[me.photo]}
                  alt="내 프로필 사진"
                  className="h-12 w-12 shrink-0 rounded-full object-cover"
                />
              ) : (
                <AvatarFallback size={48} />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-semibold">
                  {me.nickname}
                  <span className={`ml-1.5 align-middle text-[11px] font-medium ${me.isPublic ? "text-accent-strong" : "text-faint"}`}>
                    {me.isPublic ? "공개 중" : "비공개"}
                  </span>
                </p>
                <p className="mt-0.5 truncate text-[12.5px] text-muted">
                  {[
                    me.age,
                    me.area,
                    me.level && level(me.level).name,
                    visitFrequencyLabel(me.visitFrequency),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <Link
                href="/profile/new"
                className="shrink-0 text-[13px] font-medium text-muted"
              >
                공개 설정
              </Link>
            </div>
          ) : (
            <Link
              href="/profile/new"
              className="mt-3 block rounded-lg bg-surface2 px-4 py-3.5 text-center text-[13px] font-medium text-muted"
            >
              사람 찾기에 내 프로필 공개하기 (선택)
            </Link>
          )}


          {/* 공개 프로필이 아직 없으면 비어 보인다. 아무것도 안 그리면
              고장난 것처럼 보인다 — 왜 비었는지 말해준다. */}
          {peopleError && <LoadErrorNotice message="사람 목록을 불러오지 못했어요" loading={loading} onRetry={retry} hasPrevious={people.length > 0} />}
          {loading && !peopleError && !people.length && <p role="status" className="py-14 text-center text-sm text-muted">사람 불러오는 중…</p>}
          {!peopleError && !loading && people.length === 0 && (
            <div className="flex flex-col items-center py-14 text-center">
              <ShoeIllust size={68} />
              <p className="mt-4 text-[15px] font-semibold">
                아직 볼 수 있는 프로필이 없어요
              </p>
            </div>
          )}

          {!peopleError && !loading && people.length > 0 && shownPeople.length === 0 && <div className="py-14 text-center">
            <p className="text-[14px] font-medium">조건에 맞는 사람이 없어요</p>
            <button type="button" onClick={resetSearch} className="mt-3 min-h-11 px-3 text-[14px] font-semibold text-accent-strong">전체 사람 보기</button>
          </div>}
          <div className="flex flex-col divide-y divide-line">
            {shownPeople.map((p) => (
              <div key={p.id} className="flex items-center gap-4 py-4">
                {/* 사진·정보를 누르면 프로필 화면 — 어디서 열든 같은 화면이다.
                    신고는 거기서 한다. */}
                <Link
                  href={`/user?id=${p.id}&from=people`}
                  className="flex min-w-0 flex-1 items-center gap-4 text-left"
                >
                  {p.photo && photoUrls[p.photo] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoUrls[p.photo]}
                      alt={p.nickname}
                      className="h-[72px] w-[72px] shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <AvatarFallback size={72} />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[15.5px] font-semibold">
                      <span className="truncate">{p.nickname}</span>
                      <span className="text-[13.5px] font-normal text-muted">
                        {p.age}
                      </span>
                    </p>
                    <p className="mt-0.5 truncate text-[13px] text-muted">
                      {[p.area, p.level && level(p.level).name]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {(visitFrequencyLabel(p.visitFrequency) || p.achievement) && (
                      <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-faint">
                        {visitFrequencyLabel(p.visitFrequency) && <span>{visitFrequencyLabel(p.visitFrequency)}</span>}
                        <ShoeBadge achievement={p.achievement} />
                      </div>
                    )}
                  </div>
                </Link>
                {/* 대화신청 하나로 통일 — 보내면 상대 신청함에 뜨고,
                    수락하면 채팅이 열린다. 목록에서는 secondary 로 물러난다 —
                    primary CTA 는 상세 시트의 "대화신청" 하나만 강하게 둔다. */}
                <button
                  disabled={sentTo.has(p.id)}
                  onClick={() => setReqTarget(p)}
                  className={`shrink-0 text-[12.5px] ${
                    sentTo.has(p.id)
                      ? "py-2 font-medium text-faint"
                      : "button-secondary rounded-lg px-3.5 py-2 font-semibold"
                  }`}
                >
                  {sentTo.has(p.id) ? "신청완료" : "대화신청"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {reqTarget && (
        <ChatRequestSheet
          target={reqTarget}
          onClose={() => setReqTarget(null)}
          onSent={() => setSentTo((s) => new Set(s).add(reqTarget.id))}
        />
      )}
    </main>
  );
}
