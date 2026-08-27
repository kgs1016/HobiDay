"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryId, useQueryParam } from "@/lib/queryId";
import { notifyPush } from "@/lib/nativePush";
import { level, levelRangeLabel } from "@/lib/levels";
import { isProfileComplete } from "@/lib/profileGate";
import { MOCK_SESSIONS, slotsLeft, type Session } from "@/lib/mock";
import { capacityRo, totalSeats } from "@/lib/capacity";
import {
  SESSION_JOIN_COST,
  hasSupabase,
  acceptConfirm,
  cancelSignup,
  currentUser,
  deleteSession,
  fetchSession,
  fetchMyProfileDb,
  joinSession,
  proposeConfirm,
  signedPhotoUrls,
  toSession,
  withdrawConfirm,
} from "@/lib/supabase";

type S = Session & { myStatus?: string | null; cancelled?: boolean };

export default function SessionDetail() {
  const id = useQueryId();
  const from = useQueryParam("from");
  const router = useRouter();
  const [s, setS] = useState<S | null | undefined>(undefined);
  const [hostPhoto, setHostPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!id) return setS(null);
    if (!hasSupabase()) {
      setS(MOCK_SESSIONS.find((x) => x.id === id) ?? null);
      return;
    }
    // 목록에서 찾지 않고 단건으로 받는다. 목록은 "지금 신청할 수 있는
    // 모임" 만 담아서, 시작했거나 취소된 모임은 여기 없다.
    const [row, user] = await Promise.all([fetchSession(id), currentUser()]);
    setS(row ? toSession(row, undefined, user?.id) : null);
    if (row?.host_photo) {
      setHostPhoto((await signedPhotoUrls([row.host_photo]))[row.host_photo] ?? null);
    }
  };

  useEffect(() => {
    // id 는 첫 렌더에 undefined (주소를 아직 안 읽음) — 읽은 뒤에만 부른다
    if (id === undefined) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /* 모임 채팅방에서 제목을 눌러 들어왔으면 그 방으로 돌려보낸다.
     방을 여는 건 /chat 의 상태일 뿐 화면 전환이 아니라, 뒤로가기만으로는
     보던 방이 닫히고 목록으로 떨어진다. */
  const back = () => {
    if (from === "chat" && id) router.push(`/chat?room=${id}#session`);
    else router.back();
  };

  if (s === undefined)
    return <main className="px-4 pt-20 text-center text-muted">불러오는 중…</main>;
  if (s === null)
    return (
      <main className="px-4 pt-20 text-center text-muted">
        모임을 찾을 수 없어요
      </main>
    );

  const left = slotsLeft(s);
  const full = left.total <= 0;
  const anyGender = s.genderMode === "any";
  /* 조기 확정·확정 안내에 쓰는 "2:2로" / "3명으로". 성별 무관 모임에서
     "2:2" 라고 하면 없는 규칙을 말하게 된다. */
  const nRo = (n: number) => capacityRo(n, s.genderMode);
  // 시작하면 더 못 받는다 (서버도 session_join 에서 막는다).
  // 목데이터에는 startsAt 이 없어서 그때는 늘 false.
  const started = !!s.startsAt && new Date(s.startsAt).getTime() <= Date.now();
  const ended = !!s.endsAt && new Date(s.endsAt).getTime() <= Date.now();
  /* 이 화면은 목록에서 떼어낸 뒤로 끝난 모임·취소된 모임도 연다
     (채팅방에서 들어오니까). 그런데 문구는 아직 살아있는 모임만
     염두에 두고 있었다. 상태를 먼저 보고 말한다. */
  const dead = !!s.cancelled || ended;
  /* 시작한 모임의 대기 신청은 이미 끝난 것이다 — 크론이 곧 신청비를
     돌려준다. 신청함은 이걸 반영해서 "거절됨" 으로 보여주는데 이 화면만
     "승인 대기 중" 이라고 해서, 같은 신청이 두 화면에서 다르게 보였다. */
  const missed = started && s.myStatus === "waiting";
  const joined = s.myStatus === "confirmed" || s.myStatus === "waiting";

  /* 조기 확정 — 2:2 로 열었지만 남녀 수가 맞으면 그 인원으로 확정한다.
     성비가 맞고(남 = 여), 한 명 이상이고, 아직 꽉 차지 않았을 때만. */
  /* 지금 확정된 인원. 성비 모임은 짝이 맞는 쪽 수, 무관 모임은 머릿수다.
     서버(session_matched)와 같은 셈이어야 한다. */
  const matched = anyGender
    ? s.maleJoined + s.femaleJoined
    : Math.min(s.maleJoined, s.femaleJoined);
  const canEarlyConfirm = anyGender
    ? matched >= 2 && !full
    : s.maleJoined === s.femaleJoined && matched >= 1 && !full;
  const proposed = !!s.earlyConfirmAt;
  const iAmGuest = s.myStatus === "confirmed" && !s.iAmHost;

  const ERRORS: Record<string, string> = {
    not_host: "호스트만 확정할 수 있어요",
    not_open: "이미 확정된 모임이에요",
    not_balanced: "남녀 수가 맞아야 확정할 수 있어요",
    already_full: "이미 정원이 다 찼어요",
    no_proposal: "호스트가 확정 제안을 거뒀어요",
    not_member: "확정된 참가자만 할 수 있어요",
  };

  const propose = async () => {
    setBusy(true);
    const r = await proposeConfirm(s.id);
    setBusy(false);
    if (r.error) return alert(ERRORS[r.error] ?? `실패: ${r.error}`);
    // 받아야만 성사되는 제안이라, 도착을 모르면 병목이 된다
    if (r.notify?.length)
      notifyPush(
        r.notify,
        "🤝 모임 확정 제안",
        `${s.gym} 모임을 지금 인원으로 확정하자는 제안이 왔어요`,
        "/inbox"
      );
    alert(
      `${nRo(matched)} 확정하자고 보냈어요.\n상대가 받으면 모임이 완성되고 채팅방이 열려요.`
    );
    load();
  };

  const withdraw = async () => {
    setBusy(true);
    await withdrawConfirm(s.id);
    setBusy(false);
    load();
  };

  const accept = async () => {
    setBusy(true);
    const r = await acceptConfirm(s.id);
    setBusy(false);
    if (r.error) return alert(ERRORS[r.error] ?? `실패: ${r.error}`);
    if (r.confirmed) {
      // 확정의 순간 — 호스트 포함, 나 빼고 전원에게 알린다 (서버가 목록을 준다)
      if (r.notify?.length)
        notifyPush(
          r.notify,
          "🎉 모임이 확정됐어요",
          `${s.gym} 모임이 확정되고 채팅방이 열렸어요`,
          "/chat#session"
        );
    } else if (s.host?.id) {
      notifyPush(
        s.host.id,
        "✅ 확정 제안을 수락했어요",
        `${s.gym} 모임의 확정 제안을 수락한 사람이 있어요`,
        `/session?id=${s.id}`
      );
    }
    alert(
      r.confirmed
        ? `모임이 확정됐어요! 🎉\n${capacityRo(
            r.capacity ?? matched,
            r.gender_mode ?? s.genderMode
          )} 진행하고, 모임 채팅방이 열렸어요.`
        : "받았어요. 남은 참가자를 기다리고 있어요."
    );
    load();
  };

  const badges = [
    ...Array.from({ length: s.maleJoined }, (_, i) => ({ g: "m", key: `m${i}` })),
    ...Array.from({ length: s.femaleJoined }, (_, i) => ({ g: "f", key: `f${i}` })),
  ];

  /* 호스트: 모임 삭제. 신청비는 서버가 전원 반환하고, 알림은 여기서 부탁한다 */
  const onDelete = async () => {
    if (
      !confirm(
        "모임을 삭제할까요?\n신청자들에게는 취소로 표시되고, 신청비는 전원 돌려드려요."
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
      notifyPush(r.notify, "😢 모임이 취소됐어요", `${s.gym} 모임이 취소됐어요. 신청 크레딧은 돌려드렸어요.`, "/inbox", { pushOnly: true });
    alert("모임을 삭제했어요. 신청비는 전원 돌려드렸어요.");
    router.push("/");
  };

  /* 참가자: 모임에서 빠지기.
     호스트가 받아준 뒤로는 내 자리가 잡힌 것이라, 자의로 비우면
     신청비는 돌려주지 않는다. 승인 전이면 잡힌 자리가 없어 돌려준다. */
  const onLeave = async () => {
    const mine = s.myStatus === "confirmed"; // 호스트가 받아준 자리
    if (
      !confirm(
        mine
          ? "모임에서 나갈까요?\n자리를 비우는 거라 신청비는 돌려드리지 않아요.\n채팅방도 목록에서 사라져요."
          : "신청을 취소할까요? 신청비는 돌려드려요."
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
          `${s.gym} 모임에 남은 사람이 없어 취소됐어요. 신청 크레딧은 돌려드렸어요.`,
          "/inbox",
          { pushOnly: true }
        );
      alert("모임에서 나왔어요.\n남은 사람이 없어 모임은 취소됐어요.");
    } else {
      alert(
        mine ? "모임에서 나왔어요." : "신청을 취소했어요. 신청비는 돌려드렸어요."
      );
    }
    load();
  };

  const onJoin = async () => {
    if (!hasSupabase()) {
      alert(
        full
          ? "대기 신청했어요. 자리가 나면 순서대로 알려드릴게요. (목데이터 단계)"
          : "모임 신청 완료! 자리가 다 차면 확정 알림을 보내드려요. (목데이터 단계)"
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
          : "먼저 프로필을 만들어주세요 (성비 매칭의 기본 정보예요)"
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
    if (r.error === "no_credits")
      return alert(
        `크레딧이 부족해요.
` +
          `모임 신청 1회 = ${r.cost}크레딧 · 지금 ${r.balance}크레딧이에요.

` +
          `모임에서 등반 영상을 올리면 크레딧이 쌓여요.`
      );
    if (r.error) return alert(`신청 실패: ${r.error}`);
    // 승인제의 핵심 알림 — 호스트가 신청이 온 걸 몰라서 승인이 늦으면
    // 신청자는 하염없이 기다린다
    if (s.host?.id)
      notifyPush(s.host.id, "🙋 새 모임 신청", `${s.gym} 모임에 신청이 왔어요. 확인해주세요!`, "/inbox");
    // 호스트 승인제 — 신청은 전부 대기로 들어간다
    alert(
      `신청했어요! 호스트가 확인하면 알려드릴게요.
` +
        (typeof r.cost === "number"
          ? `크레딧 -${r.cost} (거절되면 돌려드려요)
`
          : "") +
        "신청함 → 보낸 신청에서 상태를 볼 수 있어요."
    );
    load();
  };

  return (
    <main className="px-4">
      <header className="flex items-center gap-3 pt-5 pb-4">
        <button onClick={back} className="text-lg text-muted">
          ←
        </button>
        <h1 className="text-[19px] font-extrabold tracking-tight">모임 정보</h1>
      </header>

      {/* 끝났는지 취소됐는지부터 말한다. 이게 없으면 아래 문구들이
          전부 "아직 갈 수 있는 모임" 처럼 읽힌다. */}
      {(dead || started) && (
        <p
          className={`mb-3 rounded-xl px-4 py-3 text-[13px] font-bold ${
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

      <section className="rounded-2xl border border-line bg-surface p-5">
        <p className="text-[18px] font-extrabold tracking-tight">
          {s.gym}
          {s.isAway && (
            <span className="ml-2 text-[12px] font-bold text-mint">🗺 원정</span>
          )}
        </p>
        <p className="mt-1 text-[13.5px] text-muted">
          {s.date} · {s.start}~{s.end}
        </p>
        <div className="mt-3 flex flex-col gap-1 text-[13.5px]">
          <p>{levelRangeLabel(s.levelMin, s.levelMax)}</p>
          {s.note && <p className="mt-1 text-ink/90">&ldquo;{s.note}&rdquo;</p>}
        </div>
      </section>

      {/* 참가 현황 — 익명 */}
      <section className="mt-4">
        <h2 className="mb-2 text-[14px] font-bold">
          참가 현황{" "}
          <span className="font-medium text-muted">
            ({s.maleJoined + s.femaleJoined}/{totalSeats(s.capacity, s.genderMode)})
          </span>
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {badges.map((b) => (
            <span
              key={b.key}
              className={`rounded-full px-3 py-1.5 text-[12.5px] font-bold ${
                b.g === "m" ? "bg-male/15 text-male" : "bg-female/15 text-female"
              }`}
            >
              {b.g === "m" ? "남" : "여"} 확정
            </span>
          ))}
          {!dead && anyGender &&
            Array.from({ length: left.total }, (_, i) => (
              <span
                key={`ea${i}`}
                className="rounded-full border border-dashed border-line px-3 py-1.5 text-[12.5px] font-semibold text-muted"
              >
                모집중
              </span>
            ))}
          {!dead && !anyGender &&
            Array.from({ length: Math.max(0, left.male) }, (_, i) => (
            <span
              key={`em${i}`}
              className="rounded-full border border-dashed border-line px-3 py-1.5 text-[12.5px] font-semibold text-muted"
            >
              남 모집중
            </span>
          ))}
          {!dead && !anyGender &&
            Array.from({ length: Math.max(0, left.female) }, (_, i) => (
            <span
              key={`ef${i}`}
              className="rounded-full border border-dashed border-line px-3 py-1.5 text-[12.5px] font-semibold text-muted"
            >
              여 모집중
            </span>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-muted">
          다른 참가자는 <b className="text-ink">확정되면</b> 서로 프로필을 볼 수
          있어요. 모임을 연 호스트는 아래에서 지금 볼 수 있어요.
        </p>
      </section>

      {/* 조기 확정 — 자리가 남아도 성비가 맞으면 그 인원으로 갈 수 있다 */}
      {s.iAmHost && !dead && canEarlyConfirm && !proposed && (
        <section className="mt-4 rounded-2xl border border-mint/40 bg-mint/10 p-5">
          <p className="text-[14.5px] font-extrabold">
            {nRo(matched)} 확정할까요?
          </p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
            {anyGender
              ? "자리를 더 기다리지 않고 지금 인원으로 모임을 열 수 있어요."
              : "지금 남녀 수가 맞아요. 자리를 더 기다리지 않고 이 인원으로 모임을 열 수 있어요."}{" "}
            <b className="text-ink">참가자가 받으면</b> 확정되고 모임 채팅방이
            열려요.
          </p>
          <button
            onClick={propose}
            disabled={busy}
            className="mt-3 w-full rounded-xl bg-mint py-3 text-[14px] font-bold text-white disabled:opacity-50"
          >
            {busy ? "보내는 중…" : `🤝 ${nRo(matched)} 모임 확정하기`}
          </button>
        </section>
      )}

      {s.iAmHost && !dead && proposed && (
        <section className="mt-4 rounded-2xl border border-line bg-surface p-5">
          <p className="text-[14.5px] font-extrabold">
            참가자의 답을 기다리는 중…
          </p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
            {nRo(matched)} 확정하자고 보냈어요. 받으면 바로 모임이
            완성돼요.
          </p>
          <button
            onClick={withdraw}
            disabled={busy}
            className="mt-3 w-full rounded-xl border border-line py-3 text-[13.5px] font-bold text-muted disabled:opacity-50"
          >
            제안 거두기
          </button>
        </section>
      )}

      {iAmGuest && !dead && proposed && !s.myAck && (
        <section className="mt-4 rounded-2xl border border-mint/40 bg-mint/10 p-5">
          <p className="text-[14.5px] font-extrabold">
            호스트가 {nRo(matched)} 하자고 해요
          </p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
            {capacityRo(s.capacity, s.genderMode)} 열린 모임인데, 자리를 더 기다리지 않고
            지금 인원으로 진행하자는 제안이에요.{" "}
            <b className="text-ink">받으면 바로 확정</b>되고 모임 채팅방이 열려요.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={withdraw}
              disabled={busy}
              className="flex-1 rounded-xl border border-line py-3 text-[13.5px] font-bold text-muted disabled:opacity-50"
            >
              더 기다릴래요
            </button>
            <button
              onClick={accept}
              disabled={busy}
              className="flex-1 rounded-xl bg-mint py-3 text-[13.5px] font-bold text-white disabled:opacity-50"
            >
              {busy ? "처리 중…" : "좋아요, 확정할게요"}
            </button>
          </div>
        </section>
      )}

      {iAmGuest && proposed && s.myAck && (
        <p className="mt-4 rounded-2xl border border-line bg-surface px-5 py-4 text-center text-[12.5px] leading-relaxed text-muted">
          확정에 동의했어요. 남은 참가자의 답을 기다리는 중이에요.
        </p>
      )}

      {/* 호스트 — 눌러서 프로필 전체 보기 */}
      {s.host && (
        <section className="mt-4">
          <h2 className="mb-2 text-[14px] font-bold">호스트 정보</h2>
          <Link
            href={`/session/host?id=${s.id}`}
            className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface p-4 active:scale-[0.99] transition-transform"
          >
            {hostPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={hostPhoto}
                alt=""
                className="h-12 w-12 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface2 text-xl">
                🧗
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-extrabold">
                {s.host.nickname}
                {s.host.age && (
                  <span className="ml-1.5 text-[12.5px] font-medium text-muted">
                    {s.host.age}
                  </span>
                )}
              </p>
              <p className="mt-0.5 truncate text-[12.5px] text-muted">
                {[
                  s.host.area,
                  s.host.level && `L${s.host.level} ${level(s.host.level).name}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <span className="shrink-0 text-muted">›</span>
          </Link>
        </section>
      )}

      {/* 등반 인증 안내는 모임 진행 화면(/room)에 있다 — 상세에서는 뺐다.
         준비물·비용 안내 세 줄도 같이 지웠다. 신청 전에 보는 화면이라
         "이 모임에 갈지" 를 정하는 정보만 남긴다. */}

      {s.myStatus === "confirmed" && (
        <div className="mt-5 flex flex-col gap-2">
          {/* 방은 호스트 말고 한 명이라도 확정되면 열린다 (확정 2명 이상).
             정원이 차기를 기다리지 않는다 — 시간·장소를 맞추는 게 방의
             쓸모라, 맞출 사람이 생긴 시점에 열려 있어야 한다. */}
          {s.maleJoined + s.femaleJoined >= 2 && (
            <Link
              href="/chat#session"
              className="block rounded-xl border border-mint/50 bg-mint/10 py-3.5 text-center text-[14.5px] font-bold text-mint"
            >
              💬 모임 채팅 열기
            </Link>
          )}
          {!dead && (
          <Link
            href={`/room?id=${s.id}`}
            className="block rounded-xl border border-accent/50 bg-accent/10 py-3.5 text-center text-[14.5px] font-bold text-accent"
          >
            🧗 모임 진행 화면 열기
          </Link>
          )}
        </div>
      )}

      <button
        // 내가 연 모임에는 신청할 수 없다. 시작한 모임도 마찬가지.
        disabled={busy || joined || s.iAmHost || full || started || dead}
        className={`mt-6 mb-8 w-full rounded-xl py-3.5 text-[15px] font-bold disabled:opacity-70 ${
          dead || s.iAmHost
            ? "bg-surface2 text-muted"
            : joined
              ? "bg-mint/15 text-mint"
              : full || started
                ? "bg-surface2 text-muted"
                : "bg-accent text-white"
        }`}
        onClick={onJoin}
      >
        {/* 끝났거나 취소된 모임이면 그 말이 먼저다. 예전엔 이 분기가
            없어서, 채팅에 "매칭이 취소되었어요" 가 떠 있는 모임을 열어도
            "✓ 모임이 확정됐어요" 라고 했다. toSession 이 cancelled 를
            confirmed 로 뭉개는 탓에 여기서는 구분조차 못 했다.

            "확정" 이 두 가지를 뜻하는 것도 그대로다 — 내 자리가 잡혔다 ·
            모임이 성사됐다. 성비가 안 맞으면 자리는 잡혀도 모임은 아직
            안 열린다. */}
        {s.cancelled
          ? "취소된 모임이에요"
          : missed
            ? "이번엔 함께하지 못했어요 · 신청비는 돌려드려요"
            : ended
              ? "끝난 모임이에요"
              : s.iAmHost
              ? "내가 연 모임이에요"
              : joined
                ? s.myStatus !== "confirmed"
                  ? "승인 대기 중 · 호스트가 확인하면 알려드려요"
                  : s.status === "confirmed"
                    ? "✓ 모임이 확정됐어요"
                    : anyGender
                      ? "✓ 자리 잡았어요 · 정원이 차면 확정돼요"
                      : "✓ 자리 잡았어요 · 성비가 맞으면 확정돼요"
                : busy
                  ? "신청 중…"
                  : started
                    ? "이미 시작한 모임이에요"
                    : full
                      ? "자리가 다 찼어요"
                      : `참여 신청하기 · ${SESSION_JOIN_COST}크레딧`}
      </button>

      {s.iAmHost && !started && !dead ? (
        <button
          onClick={onDelete}
          disabled={busy}
          className="mb-8 -mt-4 w-full rounded-xl border border-danger py-3 text-[13.5px] font-bold text-danger disabled:opacity-50"
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
          className="mb-8 -mt-4 w-full py-2 text-[13px] font-semibold text-muted underline underline-offset-4 disabled:opacity-50"
        >
          {s.myStatus === "confirmed" ? "모임에서 나가기" : "신청 취소하기"}
        </button>
      )}
    </main>
  );
}
