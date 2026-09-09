"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import GymPhoto from "@/components/GymPhoto";
import { useRouter } from "next/navigation";
import { useQueryId, useQueryParam } from "@/lib/queryId";
import { notifyPush } from "@/lib/nativePush";
import { useNow } from "@/lib/browserState";
import { level, levelRangeLabel } from "@/lib/levels";
import { isProfileComplete } from "@/lib/profileGate";
import { MOCK_PEOPLE, MOCK_SESSIONS, slotsLeft, type Session } from "@/lib/mock";
import { capacityLabel, totalSeats } from "@/lib/capacity";
import { AvatarFallback, ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import {
  hasSupabase,
  cancelSignup,
  currentUser,
  deleteSession,
  fetchSession,
  fetchSessionMembers,
  fetchMyProfileDb,
  joinSession,
  signedPhotoUrls,
  toSession,
  type SessionMember,
} from "@/lib/supabase";

type S = Session & { myStatus?: string | null; cancelled?: boolean };

/* 목데이터 폴백 — Supabase 키가 없을 때 화면만 확인한다.
   목데이터에는 신청 테이블이 없어서 확정 인원수만큼 사람을 빌려 세운다. */
function mockMembers(x: Session): SessionMember[] {
  const host = MOCK_PEOPLE.find((p) => p.id === x.host?.id);
  const rest = MOCK_PEOPLE.filter((p) => p.id !== host?.id).slice(
    0,
    Math.max(0, x.joined - (host ? 1 : 0))
  );
  return [...(host ? [host] : []), ...rest].map((p) => ({
    id: p.id,
    nickname: p.nickname,
    photo: null,
    gender: p.gender,
    age: p.age,
    area: p.area,
    level: p.level,
    is_host: p.id === host?.id,
  }));
}

async function readSessionDetail(id: string | null): Promise<{
  session: S | null;
  members: SessionMember[];
  hostPhoto: string | null;
  memberPhotos: Record<string, string>;
}> {
    if (!id || !hasSupabase()) {
      const session = MOCK_SESSIONS.find(x => x.id === id) ?? null;
      return { session, members: session ? mockMembers(session) : [], hostPhoto: null, memberPhotos: {} };
    }
    // 목록에서 찾지 않고 단건으로 받는다. 목록은 "지금 신청할 수 있는
    // 모임" 만 담아서, 시작했거나 취소된 모임은 여기 없다.
    const [row, user, mem] = await Promise.all([
      fetchSession(id),
      currentUser(),
      fetchSessionMembers(id),
    ]);
    // 얼굴은 비공개 버킷에 있다 — 호스트와 참가자 것을 한 번에 받는다
    const paths = [
      row?.host_photo,
      ...mem.map((m) => m.photo),
    ].filter(Boolean) as string[];
    const urls = paths.length ? await signedPhotoUrls(paths) : {};
    return {
      session: row ? toSession(row, undefined, user?.id) : null,
      members: mem,
      memberPhotos: urls,
      hostPhoto: row?.host_photo ? urls[row.host_photo] ?? null : null,
    };
}

export default function SessionDetail() {
  const id = useQueryId();
  const from = useQueryParam("from");
  if (id === undefined) return <main className="px-4 pt-24 text-center text-[13.5px] text-faint">불러오는 중…</main>;
  // 주소의 모임이 바뀌면 이전 모임의 화면과 진행 중 응답도 함께 정리한다.
  return <SessionContent key={id ?? ""} id={id} from={from} />;
}

function SessionContent({ id, from }: { id: string | null; from: string | null | undefined }) {
  const router = useRouter();
  const now = useNow();
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof readSessionDetail>>>();
  const [busy, setBusy] = useState(false);
  const s = detail?.session;
  const members = detail?.members ?? [];
  const hostPhoto = detail?.hostPhoto ?? null;
  const memberPhotos = detail?.memberPhotos ?? {};

  const load = async () => {
    const next = await readSessionDetail(id);
    setDetail(next);
  };

  useEffect(() => {
    const controller = new AbortController();
    readSessionDetail(id).then(next => {
      if (!controller.signal.aborted) setDetail(next);
    });
    return () => controller.abort();
  }, [id]);

  /* 모임 채팅방에서 제목을 눌러 들어왔으면 그 방으로 돌려보낸다.
     방을 여는 건 /chat 의 상태일 뿐 화면 전환이 아니라, 뒤로가기만으로는
     보던 방이 닫히고 목록으로 떨어진다. */
  const back = () => {
    if (from === "chat" && id) router.push(`/chat?room=${id}#session`);
    else router.back();
  };

  if (s === undefined)
    return (
      <main className="px-4 pt-24 text-center text-[13.5px] text-faint">
        불러오는 중…
      </main>
    );
  if (s === null)
    return (
      <main className="px-4 pt-24 text-center text-[13.5px] text-muted">
        모임을 찾을 수 없어요
      </main>
    );

  const left = slotsLeft(s);
  const full = left.total <= 0;
  // 시작하면 더 못 받는다 (서버도 session_join 에서 막는다).
  // 목데이터에는 startsAt 이 없어서 그때는 늘 false.
  const started = !!s.startsAt && new Date(s.startsAt).getTime() <= now;
  const ended = !!s.endsAt && new Date(s.endsAt).getTime() <= now;
  /* 이 화면은 목록에서 떼어낸 뒤로 끝난 모임·취소된 모임도 연다
     (채팅방에서 들어오니까). 그런데 문구는 아직 살아있는 모임만
     염두에 두고 있었다. 상태를 먼저 보고 말한다. */
  const dead = !!s.cancelled || ended;
  /* 시작한 모임의 대기 신청은 이미 끝난 것이다 — 크론이 곧 거절로
     처리한다. 신청함은 이걸 반영해서 "거절됨" 으로 보여주는데 이 화면만
     "승인 대기 중" 이라고 해서, 같은 신청이 두 화면에서 다르게 보였다. */
  const missed = started && s.myStatus === "waiting";
  const joined = s.myStatus === "confirmed" || s.myStatus === "waiting";

  const badges = Array.from({ length: s.joined }, (_, i) => `c${i}`);

  /* 호스트: 모임 삭제. 알림은 여기서 부탁한다 */
  const onDelete = async () => {
    if (
      !confirm(
        "모임을 삭제할까요?\n신청자들에게는 취소로 표시돼요."
      )
    )
      return;
    setBusy(true);
    const r = await deleteSession(s.id);
    setBusy(false);
    if (r.error === "not_host") return alert("호스트만 삭제할 수 있어요");
    // 시작 전에 띄워둔 화면으로 눌렀을 때 — 서버가 막는다
    if (r.error === "started")
      return alert("이미 시작한 모임이라 바꿀 수 없어요.");
    if (r.error) return alert(`삭제 실패: ${r.error}`);
    if (r.notify?.length)
      // 알림함에는 session_collapse 가 이미 남겼다 — 푸시만 쏜다
      notifyPush(r.notify, "😢 모임이 취소됐어요", `${s.gym} 모임이 취소됐어요.`, "/inbox", { pushOnly: true });
    alert("모임을 삭제했어요.");
    router.push("/");
  };

  /* 참가자: 모임에서 빠지기 */
  const onLeave = async () => {
    const mine = s.myStatus === "confirmed"; // 호스트가 받아준 자리
    if (
      !confirm(
        mine
          ? "모임에서 나갈까요?\n채팅방도 목록에서 사라져요."
          : "신청을 취소할까요?"
      )
    )
      return;
    setBusy(true);
    const r = await cancelSignup(s.id);
    setBusy(false);
    // 시작 전에 띄워둔 화면으로 눌렀을 때 — 서버가 막는다
    if (r.error === "started")
      return alert("이미 시작한 모임이라 바꿀 수 없어요.");
    if (r.error) return alert(`실패: ${r.error}`);
    // 내가 빠지면서 호스트 혼자 남으면 모임이 통째로 취소된다
    if (r.cancelled) {
      if (r.notify?.length)
        notifyPush(
          r.notify,
          "😢 모임이 취소됐어요",
          `${s.gym} 모임에 남은 사람이 없어 취소됐어요.`,
          "/inbox",
          { pushOnly: true }
        );
      alert("모임에서 나왔어요.\n남은 사람이 없어 모임은 취소됐어요.");
    } else {
      alert(mine ? "모임에서 나왔어요." : "신청을 취소했어요.");
    }
    load();
  };

  const onJoin = async () => {
    if (!hasSupabase()) {
      alert(
        full
          ? "대기 신청했어요. 자리가 나면 순서대로 알려드릴게요. (목데이터 단계)"
          : "모임 신청 완료! (목데이터 단계)"
      );
      return;
    }
    setBusy(true);
    const user = await currentUser();
    if (!user) {
      setBusy(false);
      alert("신청하려면 로그인이 필요해요");
      router.push("/login");
      return;
    }
    const profile = await fetchMyProfileDb();
    if (!isProfileComplete(profile)) {
      setBusy(false);
      alert(
        profile
          ? "프로필을 먼저 완성해주세요 (대표 사진·구력)"
          : "먼저 프로필을 만들어주세요 (모임 조건을 맞추는 기본 정보예요)"
      );
      router.push("/profile/new");
      return;
    }
    const r = await joinSession(s.id);
    setBusy(false);
    if (r.error === "is_host") return alert("내가 연 모임이에요!");
    if (r.error === "full") return alert("자리가 이미 다 찼어요.");
    // 목록에서 사라지기 전에 열어둔 화면에서 누른 경우
    if (r.error === "started")
      return alert("이미 시작한 모임이에요. 다른 모임을 찾아보세요.");
    if (r.error) return alert(`신청 실패: ${r.error}`);
    // 승인제의 핵심 알림 — 호스트가 신청이 온 걸 몰라서 승인이 늦으면
    // 신청자는 하염없이 기다린다
    if (s.host?.id)
      notifyPush(s.host.id, "🙋 새 모임 신청", `${s.gym} 모임에 신청이 왔어요. 확인해주세요!`, "/inbox");
    // 호스트 승인제 — 신청은 전부 대기로 들어간다
    alert(
      "신청했어요! 호스트가 확인하면 알려드릴게요.\n신청 내역 → 보낸 신청에서 상태를 볼 수 있어요."
    );
    load();
  };

  return (
    <>
    <main className="px-4 pb-32">
      <header className="flex items-center gap-2 pt-4 pb-2">
        <button
          onClick={back}
          aria-label="뒤로 가기"
          className="-ml-2 flex h-10 w-10 items-center justify-center text-ink"
        >
          <ChevronLeftIcon size={22} />
        </button>
        <h1 className="text-[18px] font-bold tracking-tight">모임 정보</h1>
      </header>

      {/* 끝났는지 취소됐는지부터 말한다. 이게 없으면 아래 문구들이
          전부 "아직 갈 수 있는 모임" 처럼 읽힌다. */}
      {(dead || started) && (
        <p
          className={`mb-3 rounded-lg px-4 py-3 text-[13px] font-medium ${
            s.cancelled
              ? "bg-danger/10 text-danger"
              : "bg-surface2 text-muted"
          }`}
        >
          {s.cancelled
            ? "이 모임은 취소됐어요. 채팅방은 24시간 뒤에 사라져요."
            : ended
              ? "이미 끝난 모임이에요."
              : "지금 진행 중인 모임이에요."}
        </p>
      )}

      {/* 핵심 정보 — 카드 없이 문서처럼 */}
      <section className="pt-2">
        <p className="text-[20px] font-bold tracking-tight">
          <span className="align-middle">{s.gym}</span>
          {s.isAway && (
            <span className="ml-2 align-middle text-[12px] font-normal text-faint">
              원정
            </span>
          )}
        </p>
        <p className="mt-1 text-[14px] text-muted">
          {s.date} · {s.start}–{s.end}
        </p>
        <div className="mt-4">
          <GymPhoto src={s.gymThumb} name={s.gym} wide />
        </div>
        <div className="mt-3 flex flex-col gap-1 text-[13.5px]">
          <p>{levelRangeLabel(s.levelMin, s.levelMax)}</p>
          <p className="text-muted">{capacityLabel(s.capacity)}</p>
        </div>
        {s.note && (
          <p className="mt-3 rounded-lg bg-surface2 px-3.5 py-3 text-[13.5px] leading-relaxed">
            &ldquo;{s.note}&rdquo;
          </p>
        )}
      </section>

      {/* 참가 현황 — 확정된 자리에는 그 사람 이름이 들어간다.
          누르면 프로필이 열린다 (호스트도 이 명단 안에 있다).
          명단을 못 받으면(서버에 아직 session_members 가 없거나 볼 수
          없는 모임이면) 예전처럼 익명 칸을 그린다. */}
      <section className="mt-6 border-t border-line pt-5">
        <h2 className="text-[15px] font-bold">
          참가 현황{" "}
          <span className="font-normal text-muted">
            {s.joined}/{totalSeats(s.capacity)}
          </span>
        </h2>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {members.length > 0
            ? members.map((m) => (
                <Link
                  key={m.id}
                  href={`/user?id=${m.id}&s=${s.id}`}
                  className="flex items-center gap-1.5 rounded-lg bg-surface2 py-1 pl-1 pr-2.5 transition-colors active:bg-line"
                >
                  {m.photo && memberPhotos[m.photo] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={memberPhotos[m.photo]}
                      alt=""
                      className="h-6 w-6 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <AvatarFallback size={24} />
                  )}
                  <span className="text-[12.5px] font-medium text-ink">
                    {m.nickname}
                    {m.is_host && (
                      <span className="ml-1 font-normal text-faint">· 호스트</span>
                    )}
                  </span>
                </Link>
              ))
            : badges.map((key) => (
                <span
                  key={key}
                  className="rounded-lg bg-surface2 px-3 py-1.5 text-[12.5px] font-medium text-ink"
                >
                  확정
                </span>
              ))}

          {!dead &&
            Array.from({ length: left.total }, (_, i) => (
              <span
                key={`ea${i}`}
                className="rounded-lg border border-dashed border-line px-3 py-1.5 text-[12.5px] text-faint"
              >
                모집중
              </span>
            ))}
        </div>
      </section>

      {/* 호스트 — 눌러서 프로필 전체 보기 */}
      {s.host && (
        <section className="mt-6 border-t border-line pt-5">
          <h2 className="text-[15px] font-bold">호스트</h2>
          <Link
            href={`/user?id=${s.host.id}&s=${s.id}`}
            className="mt-3 flex items-center gap-3 rounded-xl transition-colors active:bg-surface2"
          >
            {hostPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={hostPhoto}
                alt=""
                className="h-12 w-12 shrink-0 rounded-full object-cover"
              />
            ) : (
              <AvatarFallback size={48} />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold">
                {s.host.nickname}
                {s.host.age && (
                  <span className="ml-1.5 text-[13px] font-normal text-muted">
                    {s.host.age}
                  </span>
                )}
              </p>
              <p className="mt-0.5 truncate text-[12.5px] text-muted">
                {[
                  s.host.area,
                  s.host.level && level(s.host.level).name,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <ChevronRightIcon size={16} className="shrink-0 text-faint" />
          </Link>
        </section>
      )}

      {/* 준비물·비용 안내 세 줄은 지웠다. 신청 전에 보는 화면이라
         "이 모임에 갈지" 를 정하는 정보만 남긴다. 진행 화면(/room)도
         없앴다 — 참가 현황이 위에 있고, 영상은 커뮤니티로 갔다. */}

      {/* 둘이 되면 모임이 확정되고 방도 함께 열린다. 최대 정원은
          상한이지 채워야 하는 수가 아니다. */}
      {s.myStatus === "confirmed" && s.joined >= 2 && (
        <div className="mt-6">
          <Link
            href="/chat#session"
            className="button-secondary block rounded-xl py-3.5 text-center text-[14px] font-semibold"
          >
            모임 채팅 열기
          </Link>
        </div>
      )}

      {s.iAmHost && !started && !dead ? (
        <button
          onClick={onDelete}
          disabled={busy}
          className="mt-6 w-full py-2 text-center text-[13px] font-medium text-danger disabled:opacity-50"
        >
          모임 삭제하기
        </button>
      ) : null}

      {/* 시작했거나 취소된 모임에는 반납할 자리가 없다.
          남은 채팅방 정리는 채팅방의 나가기가 맡는다. */}
      {joined && !s.iAmHost && !started && !dead && (
        <button
          onClick={onLeave}
          disabled={busy}
          className="mt-6 w-full py-2 text-[13px] font-medium text-muted underline underline-offset-4 disabled:opacity-50"
        >
          {s.myStatus === "confirmed" ? "모임에서 나가기" : "신청 취소하기"}
        </button>
      )}
    </main>

    {/* 신청 CTA — 하단 고정. 목록이 아니라 여기서 신청한다 */}
    <div
      className="fixed inset-x-0 z-10"
      style={{ bottom: "calc(3.5rem + env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto max-w-md border-t border-line bg-surface px-4 py-3">
        <button
          // 내가 연 모임에는 신청할 수 없다. 시작한 모임도 마찬가지.
          disabled={busy || joined || s.iAmHost || full || started || dead}
          className={`w-full rounded-xl py-3.5 text-[15px] font-semibold ${
            dead || s.iAmHost || full || started
              ? "bg-surface2 text-faint"
              : joined
                ? "bg-accent-soft text-accent-strong"
                : "button-primary"
          }`}
          onClick={onJoin}
        >
          {/* 끝났거나 취소된 모임이면 그 말이 먼저다. 예전엔 이 분기가
              없어서, 채팅에 "매칭이 취소되었어요" 가 떠 있는 모임을 열어도
              "모임이 확정됐어요" 라고 했다. toSession 이 cancelled 를
              confirmed 로 뭉개는 탓에 여기서는 구분조차 못 했다.

              "확정" 이 두 가지를 뜻하는 것도 그대로다 — 내 자리가 잡혔다 ·
              모임이 성사됐다. 둘이 되는 순간 둘이 같아져서, 자리가 잡혔는데
              모임은 아직인 상태가 이제는 없다. */}
          {s.cancelled
            ? "취소된 모임이에요"
            : missed
              ? "이번엔 함께하지 못했어요"
              : ended
                ? "끝난 모임이에요"
                : s.iAmHost
                ? "내가 연 모임이에요"
                : joined
                  ? s.myStatus !== "confirmed"
                    ? "승인 대기 중 · 호스트가 확인하면 알려드려요"
                    : s.status === "confirmed"
                      ? "모임이 확정됐어요"
                      : "자리 잡았어요"
                  : busy
                    ? "신청 중…"
                    : started
                      ? "이미 시작한 모임이에요"
                      : full
                        ? "자리가 다 찼어요"
                        : "참여 신청하기"}
        </button>
      </div>
    </div>
    </>
  );
}
