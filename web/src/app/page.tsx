"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isProfileComplete } from "@/lib/profileGate";
import SessionCard from "@/components/SessionCard";
import SessionFilterBar from "@/components/SessionFilterBar";
import ProfileTodo from "@/components/ProfileTodo";
import ReportSheet from "@/components/ReportSheet";
import { AvatarFallback, PlusIcon } from "@/components/icons";
import { HoldIllust, ShoeIllust } from "@/components/illustrations";
import { notifyPush } from "@/lib/nativePush";
import { MOCK_SESSIONS, MOCK_PEOPLE, type Session, type Person } from "@/lib/mock";
import { careerLabel, level } from "@/lib/levels";
import { MOCK_GYMS } from "@/lib/meetupOptions";
import {
  EMPTY_FILTER,
  activeFilterCount,
  applySessionFilter,
} from "@/lib/sessionFilter";
import { loadMyProfile, type MyProfile } from "@/lib/myProfile";
import {
  hasSupabase,
  currentUser,
  fetchSessions,
  fetchPeople,
  fetchMyProfileDb,
  CREDIT_SESSION_VIDEO,
  REQUEST_COST,
  fetchAppFlags,
  fetchCredits,
  type AppFlags,
  fetchGyms,
  type Gym,
  fetchInboxCounts,
  fetchNotifications,
  fetchSentRequests,
  sendRequest,
  signedPhotoUrls,
  toSession,
  type Credits,
} from "@/lib/supabase";
import type { GymOption } from "@/components/SessionFilterBar";

export default function Home() {
  // Supabase 키가 없을 때만 목데이터로 화면을 본다 (개발 폴백).
  // 실제 배포에선 목데이터를 초기값으로 두면 안 된다 — 확인이 끝나기 전에
  // 존재하지 않는 모임이 1초쯤 그려진다.
  const mockMode = !hasSupabase();
  const [tab, setTab] = useState<"session" | "people">("session");
  const [me, setMe] = useState<MyProfile | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [flags, setFlags] = useState<AppFlags | null>(null);
  const [ready, setReady] = useState(mockMode);
  const [sessions, setSessions] = useState<Session[]>(mockMode ? MOCK_SESSIONS : []);
  const [people, setPeople] = useState<(Person & { intro?: string })[]>(
    mockMode ? MOCK_PEOPLE : []
  );
  const [live, setLive] = useState(false);
  // Gym Master — 짐 필터의 검색 대상. 못 받으면(mock·마이그레이션 전) 폴백
  const [masterGyms, setMasterGyms] = useState<Gym[] | null>(null);
  // 모임 찾기 필터 — 서버를 다시 부르지 않고 받아온 목록에서 거른다
  const [filter, setFilter] = useState(EMPTY_FILTER);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  // 관심 보내기
  const [credits, setCredits] = useState<Credits | null>(null);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [counts, setCounts] = useState<Awaited<ReturnType<typeof fetchInboxCounts>>>(null);
  // 종 아이콘 배지 — 안 읽은 알림 수만 쓴다
  const [unread, setUnread] = useState(0);
  const [reqTarget, setReqTarget] = useState<Person | null>(null);
  const [reqMsg, setReqMsg] = useState("");
  const [reqBusy, setReqBusy] = useState(false);
  // 신고 (신고하면 차단까지 걸려 목록에서도 빠진다)
  const [reportTarget, setReportTarget] = useState<Person | null>(null);
  // 프로필 상세 — 카드를 누르면 큰 사진과 전체 소개를 보고 관심을 정한다
  const [detail, setDetail] = useState<(Person & { intro?: string }) | null>(null);

  useEffect(() => {
    if (window.location.hash === "#people") setTab("people");

    (async () => {
      if (!hasSupabase()) {
        setMe(loadMyProfile());
        setAuthed(null);
        return;
      }
      const user = await currentUser();
      setAuthed(!!user);

      // 비로그인은 DB가 아무것도 안 내려준다. 목데이터가 실제 모임처럼
      // 보이는 걸 막으려고 조회 자체를 하지 않는다.
      // 플래그만 읽는다(로그인 불필요) — 오픈 전 안내 카드에 쓴다.
      if (!user) {
        setFlags(await fetchAppFlags());
        return;
      }

      // 프로필(사진 포함)을 먼저 완성해야 둘러볼 수 있다.
      // 막는 건 RequireProfile 이 레이아웃에서 한다 — 여기서는 조회만 멈춘다.
      const prof = await fetchMyProfileDb();
      if (!isProfileComplete(prof)) return;
      setMe(prof);

      // 오픈 전에는 모임·사람을 잠근다 (대시보드 app_config 로 켠다)
      const f = await fetchAppFlags();
      setFlags(f);
      if (f && !f.sessions_open && !f.people_open) {
        const cr = await fetchCredits();
        if (cr) setCredits(cr);
        return;
      }

      // 사람 찾기는 이성만 — 내 성별을 알아야 걸러서 받을 수 있다
      const [rows, ppl, gymRows] = await Promise.all([
        fetchSessions(),
        fetchPeople(prof ? { id: user.id, gender: prof.gender } : undefined),
        fetchGyms(),
      ]);
      if (gymRows) setMasterGyms(gymRows);
      if (prof) setMe(prof);
      if (rows) {
        setSessions(rows.map((r) => toSession(r, prof?.homeGym, user.id)));
        setLive(true);
      }
      // 비공개 버킷이라 표시용 서명 URL 을 한 번에 받아온다.
      // 사람 목록과 모임 호스트를 같이 넣어야 요청이 한 번으로 끝난다.
      const paths = [
        ...(ppl ?? []).map((x) => x.photo),
        ...(rows ?? []).map((r) => r.host_photo),
        prof?.photo, // "내 프로필 (공개 중)" 줄 — 빼먹으면 내 사진만 비어 뜬다
      ].filter(Boolean) as string[];
      if (ppl) setPeople(ppl);
      if (paths.length > 0) setPhotoUrls(await signedPhotoUrls(paths));

      const [sent, c, cr, notis] = await Promise.all([
        fetchSentRequests(),
        fetchInboxCounts(),
        fetchCredits(),
        fetchNotifications(),
      ]);
      if (sent) setSentTo(new Set(sent.map((s) => s.to_id)));
      if (c) setCounts(c);
      if (cr) setCredits(cr);
      if (notis) setUnread(notis.unread);

      setReady(true); // 여기까지 와야 목록을 그린다
    })();
  }, []);

  const REQ_ERRORS: Record<string, string> = {
    already: "이미 관심을 보낸 상대예요",
    self: "나에게는 보낼 수 없어요",
    same_gender: "이성에게만 보낼 수 있어요",
    not_public: "상대가 프로필을 내렸어요",
    no_profile: "먼저 내 프로필을 만들어주세요",
  };

  const sendReq = async () => {
    if (!reqTarget) return;
    setReqBusy(true);
    const r = await sendRequest(reqTarget.id, reqMsg);
    setReqBusy(false);

    if (r.error === "no_credits") {
      return alert(
        `크레딧이 부족해요.\n` +
          `관심 1회 = ${r.cost?.toLocaleString()}크레딧 · 지금 ${r.balance?.toLocaleString()}크레딧이에요.\n\n` +
          `모임에서 등반 영상을 올리면 +${CREDIT_SESSION_VIDEO}크레딧씩 쌓여요.`
      );
    }
    if (r.error) return alert(REQ_ERRORS[r.error] ?? `실패: ${r.error}`);

    notifyPush(
      reqTarget.id,
      "💌 새 관심이 도착했어요",
      reqMsg.trim() || "신청함에서 프로필을 확인해보세요",
      "/inbox"
    );
    setSentTo((s) => new Set(s).add(reqTarget.id));
    if (typeof r.balance === "number")
      setCredits((c) => (c ? { ...c, balance: r.balance! } : c));
    setReqTarget(null);
    alert(
      `${reqTarget.nickname}님에게 관심을 보냈어요!\n` +
        (r.spent ? `크레딧 -${r.cost} (남은 ${r.balance})` : "수락하면 채팅이 열려요.")
    );
  };


  // 오픈 전 대기 화면 — 가입·프로필은 끝냈고 기능만 잠긴 상태.
  // authed 를 함께 보는 이유: 로그인도 안 한 사람에게 "가입 완료!" 가 뜨면
  // 안 된다. 비로그인은 아래 로그인 안내 화면으로 내려보낸다.
  if (authed && flags && !flags.sessions_open && !flags.people_open) {
    const openDay = flags.open_at
      ? new Date(flags.open_at).toLocaleDateString("ko-KR", {
          month: "long",
          day: "numeric",
        })
      : null;
    return (
      <main className="px-4">
        <header className="pt-10 text-center">
          <p className="text-[14px] font-bold tracking-[2px] text-accent">
            HOBIDAY
          </p>
          <div className="mt-7 flex justify-center">
            <HoldIllust size={76} />
          </div>
          <h1 className="mt-5 text-[21px] font-bold leading-snug tracking-tight">
            가입 완료
            {openDay && (
              <>
                <br />
                {openDay}에 모임이 열려요
              </>
            )}
          </h1>
          {flags.notice && (
            <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
              {flags.notice}
            </p>
          )}
        </header>

        <section className="mx-auto mt-8 flex max-w-sm items-center justify-between rounded-xl bg-surface2 px-5 py-4">
          <p className="text-[14px] text-muted">내 크레딧</p>
          <p className="text-[20px] font-bold">
            {(credits?.balance ?? 0).toLocaleString()}
          </p>
        </section>
        <p className="mx-auto mt-2 max-w-sm px-1 text-[12.5px] text-faint">
          오픈하면 관심 {Math.floor((credits?.balance ?? 0) / REQUEST_COST)}번을
          보낼 수 있어요
        </p>

        <section className="mx-auto mt-6 max-w-sm rounded-xl bg-surface2 p-5">
          <p className="text-[13.5px] font-semibold">오픈하면 할 수 있는 것</p>
          <div className="mt-3 flex flex-col gap-2.5 text-[13px] leading-relaxed">
            <p>
              <span className="font-medium">모임 찾기</span>
              <span className="text-muted">
                {" "}
                — 남녀 반반으로, 또는 성별 상관없이 함께 볼더링
              </span>
            </p>
            <p>
              <span className="font-medium">사람 찾기</span>
              <span className="text-muted"> — 마음에 드는 사람에게 관심 보내기</span>
            </p>
            <p>
              <span className="font-medium">등반 영상</span>
              <span className="text-muted"> — 서로 찍어주고 크레딧 적립</span>
            </p>
            <p>
              <span className="font-medium">채팅</span>
              <span className="text-muted"> — 수락하면 1:1, 확정되면 단체방</span>
            </p>
          </div>
        </section>

        <div className="mx-auto mt-4 max-w-sm">
          <Link
            href="/profile/new"
            className="block rounded-xl border border-line py-3.5 text-center text-[14px] font-semibold text-ink"
          >
            내 프로필 다듬기
          </Link>
        </div>

        <p className="mt-6 text-center text-[12px] text-faint">
          오픈 소식은 가입하신 이메일로 알려드려요.
        </p>
      </main>
    );
  }

  // 비로그인 게이트 — authed 가 null 인 동안(확인 중)은 띄우지 않아 깜빡임이 없다
  if (authed === false) {
    // 오픈 전(잠금)일 때만 사전 가입 안내를 띄운다. 날짜는 DB(open_at)가
    // 유일한 출처다 — 하드코딩하면 날짜를 옮길 때마다 화면과 어긋난다.
    const preOpen = flags && !flags.sessions_open && !flags.people_open;
    const openDay = flags?.open_at
      ? new Date(flags.open_at).toLocaleDateString("ko-KR", {
          month: "long",
          day: "numeric",
        })
      : null;
    return (
      <main className="px-4">
        <header className="pt-16 text-center">
          <p className="text-[14px] font-bold tracking-[2px] text-accent">
            HOBIDAY
          </p>
          <h1 className="mt-4 text-[22px] font-bold leading-snug tracking-tight">
            취미로 시작해서,
            <br />
            사람으로 끝나는 하루
          </h1>
        </header>

        <div className="mx-auto mt-9 flex max-w-sm flex-col gap-2">
          <Link
            href="/login"
            className="rounded-xl bg-accent py-3.5 text-center text-[15px] font-semibold text-white active:bg-accent-pressed"
          >
            로그인 하기
          </Link>
          <Link
            href="/intro.html"
            className="rounded-xl border border-line py-3.5 text-center text-[14px] font-medium text-ink"
          >
            하비데이가 뭔가요?
          </Link>
        </div>

        {preOpen && (
          <section className="mx-auto mt-7 max-w-sm rounded-xl bg-surface2 px-5 py-4 text-center">
            <p className="text-[13px] font-semibold">
              {openDay ? `${openDay} 오픈 · ` : ""}지금은 사전 가입 중이에요
            </p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
              오픈하면 가입하신 이메일로 알려드릴게요.
            </p>
          </section>
        )}

        <p className="mt-6 text-center text-[12px] text-faint">
          참여자 프로필을 보호하려고 로그인 후에만 공개해요.
        </p>
      </main>
    );
  }

  // 위 화면들(온보딩·잠금·비로그인) 중 어느 것도 아닌데 아직 조회가 안 끝난 상태.
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
     암장이 목록에 두 줄로 앉는다. */
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
  const shown = applySessionFilter(sessions, filter);

  return (
    <main className="px-4">
      {/* 헤더 — 로고는 작게, 오른쪽에 만들기·알림만 */}
      <header className="flex items-center justify-between pt-5 pb-3">
        <p className="text-[16px] font-bold tracking-[1.5px] text-accent">
          HOBIDAY
        </p>
        <div className="flex items-center gap-3">
          {/* 프로필 관리는 내 정보 탭에서 들어가면 되니 홈에서는 뺐다 */}
          <Link
            href="/session/new"
            className="flex items-center gap-1 py-1 text-[13.5px] font-semibold text-accent-pressed"
          >
            <PlusIcon size={14} strokeWidth={2.2} />
            모임 만들기
          </Link>
          {/* 알림함 — 푸시를 놓쳐도 여기 남아 있다 */}
          <Link
            href="/notifications"
            aria-label="알림"
            className="relative -mr-1 px-1 py-1 text-ink"
          >
            <svg
              width="21"
              height="21"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {unread > 0 && (
              <span className="absolute right-0 top-0 min-w-[15px] rounded-full bg-danger px-1 text-center text-[9.5px] font-bold leading-[15px] text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>
        </div>
      </header>

      {/* 탭 — 텍스트만, 밑줄은 글자 폭만큼 */}
      <div className="flex gap-5 border-b border-line">
        {(
          [
            ["session", "모임"],
            ["people", "사람"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 pb-2.5 pt-1 text-[15.5px] ${
              tab === key
                ? "border-ink font-bold text-ink"
                : "border-transparent font-medium text-faint"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "session" ? (
        <>
          <SessionFilterBar
            value={filter}
            onChange={setFilter}
            gyms={gymChoices}
          />

          {!live && hasSupabase() === false && (
            <p className="mt-3 rounded-lg bg-surface2 px-4 py-2.5 text-center text-[11.5px] text-faint">
              미리보기 데이터예요 · Supabase 연결 후 실제 모임이 표시됩니다
            </p>
          )}

          {/* 빈 화면이 두 가지다. 열린 모임이 없는 것과, 있는데 내가
              건 조건에 안 걸리는 것 — 할 일이 다르니 말도 다르게 한다. */}
          {sessions.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <HoldIllust size={68} />
              <p className="mt-4 text-[15px] font-semibold">
                아직 열린 모임이 없어요
              </p>
              <p className="mt-1 text-[13px] text-muted">
                첫 모임을 직접 열어보세요.
              </p>
              <Link
                href="/session/new"
                className="mt-4 rounded-lg bg-accent px-4 py-2.5 text-[13.5px] font-semibold text-white active:bg-accent-pressed"
              >
                모임 만들기
              </Link>
            </div>
          ) : shown.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-[14px] font-medium">조건에 맞는 모임이 없어요</p>
              <button
                onClick={() => setFilter(EMPTY_FILTER)}
                className="mt-3 text-[13px] font-medium text-accent-pressed"
              >
                필터 초기화
              </button>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-line pb-6">
              {shown.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  hostPhotoUrl={s.host?.photo ? photoUrls[s.host.photo] : undefined}
                  gymPhotoUrl={s.gymThumb}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="pb-6">
          {/* 내 프로필 (공개 중) — 목록 위의 한 줄 */}
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
                  <span className="ml-1.5 align-middle text-[11px] font-medium text-accent-pressed">
                    공개 중
                  </span>
                </p>
                <p className="mt-0.5 truncate text-[12.5px] text-muted">
                  {[
                    me.age,
                    me.area,
                    `L${me.level}`,
                    careerLabel(me.careerId) && `클라이밍 ${careerLabel(me.careerId)}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <Link
                href="/profile/new"
                className="shrink-0 text-[13px] font-medium text-muted"
              >
                관리
              </Link>
            </div>
          ) : (
            <Link
              href="/profile/new"
              className="mt-3 block rounded-lg bg-surface2 px-4 py-3.5 text-center text-[13px] font-medium text-muted"
            >
              내 프로필을 올리면 여기에 공개돼요
            </Link>
          )}

          {me && (
            <div className="pt-3">
              <ProfileTodo profile={me} />
            </div>
          )}

          {/* 이성만 걸러 오므로 빈 경우가 생긴다. 아무것도 안 그리면
              고장난 것처럼 보인다 — 왜 비었는지 말해준다. */}
          {people.length === 0 && (
            <div className="flex flex-col items-center py-14 text-center">
              <ShoeIllust size={68} />
              <p className="mt-4 text-[15px] font-semibold">
                아직 볼 수 있는 프로필이 없어요
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">
                프로필을 공개한 이성 회원이 생기면 바로 보여요.
              </p>
            </div>
          )}

          <div className="flex flex-col divide-y divide-line">
            {people.map((p) => (
              <div key={p.id} className="flex items-center gap-4 py-4">
                {/* 사진·정보를 누르면 상세 — 관심을 보내기 전에 크게 본다.
                    신고는 상세 시트에서 한다. */}
                <button
                  onClick={() => setDetail(p)}
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
                    <p className="text-[15.5px] font-semibold">
                      {p.nickname}
                      <span className="ml-1.5 text-[13.5px] font-normal text-muted">
                        {p.age}
                      </span>
                    </p>
                    <p className="mt-0.5 truncate text-[13px] text-muted">
                      {[p.area, `L${p.level}`].filter(Boolean).join(" · ")}
                    </p>
                    {careerLabel(p.careerId) && (
                      <p className="mt-0.5 text-[12.5px] text-faint">
                        클라이밍 {careerLabel(p.careerId)}
                      </p>
                    )}
                  </div>
                </button>
                {/* 관심 하나로 통일 — 보내면 상대 신청함에 뜨고, 수락하면 채팅이 열린다.
                    목록에서는 secondary 로 물러난다 — primary CTA 는 프로필
                    상세 시트의 "관심 보내기" 하나만 강하게 둔다. */}
                <button
                  disabled={sentTo.has(p.id)}
                  onClick={() => {
                    setReqTarget(p);
                    setReqMsg("");
                  }}
                  className={`shrink-0 text-[12.5px] ${
                    sentTo.has(p.id)
                      ? "py-2 font-medium text-faint"
                      : "rounded-lg bg-accent-soft px-3.5 py-2 font-semibold text-accent-pressed"
                  }`}
                >
                  {sentTo.has(p.id) ? "보냈어요" : "관심"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 프로필 상세 — 목록은 한 줄 요약뿐이라, 관심을 정하기 전에
          큰 사진과 전체 소개를 볼 자리가 필요하다 */}
      {detail && (
        <div
          className="fixed inset-0 z-30 flex items-end bg-black/50"
          onClick={() => setDetail(null)}
        >
          <div
            className="mx-auto max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-5"
            style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
            onClick={(e) => e.stopPropagation()}
          >
            {detail.photo && photoUrls[detail.photo] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrls[detail.photo]}
                alt={detail.nickname}
                className="aspect-square w-full rounded-xl object-cover"
              />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-surface2">
                <ShoeIllust size={88} />
              </div>
            )}

            <p className="mt-4 text-[19px] font-bold">
              {detail.nickname}
              <span className="ml-2 text-[13.5px] font-normal text-muted">
                {[detail.age, detail.height && `${detail.height}cm`, detail.area]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </p>
            <p className="mt-1 text-[13px] text-muted">
              {[
                `L${detail.level} ${level(detail.level).name} (${level(detail.level).colors})`,
                careerLabel(detail.careerId) &&
                  `구력 ${careerLabel(detail.careerId)}`,
                detail.homeGym,
                detail.mbti,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {detail.intro && (
              <p className="mt-3 rounded-lg bg-surface2 px-3.5 py-3 text-[13.5px] leading-relaxed">
                &ldquo;{detail.intro}&rdquo;
              </p>
            )}

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => {
                  setReportTarget(detail);
                  setDetail(null);
                }}
                className="rounded-xl border border-line px-4 py-3.5 text-[13px] font-medium text-muted"
              >
                신고
              </button>
              <button
                disabled={sentTo.has(detail.id)}
                onClick={() => {
                  setReqTarget(detail);
                  setReqMsg("");
                  setDetail(null);
                }}
                className={`flex-1 rounded-xl py-3.5 text-[14.5px] font-semibold ${
                  sentTo.has(detail.id)
                    ? "bg-surface2 text-faint"
                    : "bg-accent text-white active:bg-accent-pressed"
                }`}
              >
                {sentTo.has(detail.id)
                  ? "관심을 보냈어요"
                  : `관심 보내기 · ${REQUEST_COST}크레딧`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 관심 보내기 시트 — 한 줄 메시지를 붙이면 받는 쪽이 맥락을 보고 판단한다 */}
      {reqTarget && (
        <div
          className="fixed inset-0 z-30 flex items-end bg-black/50"
          onClick={() => setReqTarget(null)}
        >
          <div
            className="mx-auto w-full max-w-md rounded-t-2xl bg-surface p-5 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[16.5px] font-bold">
              {reqTarget.nickname}님에게 관심 보내기
            </p>
            <p className="mt-1 text-[12.5px] text-muted">
              한 줄 남기면 수락될 가능성이 높아요.
            </p>
            {/* 보내고 나서 알면 늦다 — 누르기 전에 다 말해준다 */}
            <ul className="mt-2.5 flex flex-col gap-1 rounded-lg bg-surface2 px-3.5 py-3 text-[11.5px] leading-relaxed text-muted">
              <li>
                · <b className="font-semibold text-ink">보내면 크레딧이 바로 쓰여요.</b>{" "}
                수락 여부와 상관없이 돌려드리지 않아요
              </li>
              <li>
                · 상대가 거절하거나 보낸 지 7일이 지나면 보낸 관심에서
                사라져요
              </li>
            </ul>
            <textarea
              value={reqMsg}
              onChange={(e) => setReqMsg(e.target.value.slice(0, 200))}
              rows={3}
              placeholder={`예: 같은 ${reqTarget.homeGym} 다니네요! 주말에 같이 타요`}
              className="mt-3 w-full resize-none rounded-lg bg-surface2 px-3.5 py-3 text-[16px] text-ink placeholder:text-faint focus:outline-none"
            />
            <p className="mt-1 text-right text-[11.5px] text-faint">
              {reqMsg.length}/200
            </p>
            <button
              disabled={reqBusy}
              onClick={sendReq}
              className="mt-2 w-full rounded-xl bg-accent py-3.5 text-[15px] font-semibold text-white active:bg-accent-pressed disabled:opacity-50"
            >
              {reqBusy ? "보내는 중…" : `관심 보내기 · ${REQUEST_COST}크레딧`}
            </button>
            {credits && (
              <p className="mt-1.5 text-center text-[11.5px] text-faint">
                보내면 {Math.max(0, credits.balance - REQUEST_COST)}크레딧 남아요
              </p>
            )}
            <button
              onClick={() => setReqTarget(null)}
              className="mt-2 w-full py-2 text-[13px] font-medium text-muted"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {reportTarget && (
        <ReportSheet
          targetId={reportTarget.id}
          nickname={reportTarget.nickname}
          context="profile"
          onClose={() => setReportTarget(null)}
          onDone={() =>
            // 차단까지 걸렸으니 목록에서 바로 뺀다 — 새로고침을 기다리게 하지 않는다
            setPeople((prev) => prev.filter((x) => x.id !== reportTarget.id))
          }
        />
      )}
    </main>
  );
}
