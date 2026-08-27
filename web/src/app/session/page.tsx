"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryId } from "@/lib/queryId";
import { notifyPush } from "@/lib/nativePush";
import { level, levelRangeLabel } from "@/lib/levels";
import { isProfileComplete } from "@/lib/profileGate";
import { MOCK_SESSIONS, slotsLeft, type Session } from "@/lib/mock";
import BackButton from "@/components/BackButton";
import { AvatarFallback, ChevronRightIcon } from "@/components/icons";
import {
  SESSION_JOIN_COST,
  hasSupabase,
  acceptConfirm,
  cancelSignup,
  currentUser,
  deleteSession,
  fetchSessions,
  fetchMyProfileDb,
  joinSession,
  proposeConfirm,
  signedPhotoUrls,
  toSession,
  withdrawConfirm,
} from "@/lib/supabase";

type S = Session & { myStatus?: string | null };

function ageLabel(min: number, max: number) {
  const band = (n: number) => {
    const decade = Math.floor(n / 10) * 10;
    const pos = n % 10 <= 3 ? "초반" : n % 10 <= 6 ? "중반" : "후반";
    return `${decade}대 ${pos}`;
  };
  const a = band(min);
  const b = band(max);
  return a === b ? a : `${a}~${b}`;
}

export default function SessionDetail() {
  const id = useQueryId();
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
    const [rows, user] = await Promise.all([fetchSessions(), currentUser()]);
    const row = rows?.find((r) => r.id === id);
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

  if (s === undefined)
    return <main className="px-4 pt-24 text-center text-[13.5px] text-faint">불러오는 중…</main>;
  if (s === null)
    return (
      <main className="px-4 pt-24 text-center text-[13.5px] text-muted">
        모임을 찾을 수 없어요
      </main>
    );

  const left = slotsLeft(s);
  const full = left.male <= 0 && left.female <= 0;
  const joined = s.myStatus === "confirmed" || s.myStatus === "waiting";

  /* 조기 확정 — 2:2 로 열었지만 남녀 수가 맞으면 그 인원으로 확정한다.
     성비가 맞고(남 = 여), 한 명 이상이고, 아직 꽉 차지 않았을 때만. */
  const matched = Math.min(s.maleJoined, s.femaleJoined);
  const canEarlyConfirm =
    s.maleJoined === s.femaleJoined && matched >= 1 && !full;
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
      `${matched}:${matched}로 확정하자고 보냈어요.\n상대가 받으면 모임이 완성되고 채팅방이 열려요.`
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
        ? `모임이 확정됐어요!\n${r.capacity}:${r.capacity}로 진행하고, 모임 채팅방이 열렸어요.`
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
    if (r.error) return alert(`삭제 실패: ${r.error}`);
    if (r.notify?.length)
      notifyPush(r.notify, "😢 모임이 취소됐어요", `${s.gym} 모임이 취소됐어요. 신청 크레딧은 돌려드렸어요.`, "/inbox");
    alert("모임을 삭제했어요. 신청비는 전원 돌려드렸어요.");
    router.push("/");
  };

  /* 참가자: 모임에서 빠지기. 대기 중엔 반환, 확정 후엔 반환 없음 */
  const onLeave = async () => {
    const waiting = s.myStatus !== "confirmed";
    if (
      !confirm(
        waiting
          ? "신청을 취소할까요? 신청비는 돌려드려요."
          : "모임에서 나갈까요?\n확정된 자리를 비우는 거라 신청비는 돌려드리지 않아요."
      )
    )
      return;
    setBusy(true);
    const r = await cancelSignup(s.id);
    setBusy(false);
    if (r.error) return alert(`실패: ${r.error}`);
    alert(waiting ? "신청을 취소했어요. 신청비는 돌려드렸어요." : "모임에서 나왔어요.");
    load();
  };

  const onJoin = async () => {
    if (!hasSupabase()) {
      alert(
        full
          ? "대기 신청했어요. 자리가 나면 순서대로 알려드릴게요. (목데이터 단계)"
          : "모임 신청 완료! 성비가 맞으면 확정 알림을 보내드려요. (목데이터 단계)"
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
    <>
      <main className="px-4 pb-32">
        <header className="flex items-center gap-2 pt-4 pb-2">
          <BackButton />
          <h1 className="text-[18px] font-bold tracking-tight">모임 정보</h1>
        </header>

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
          <div className="mt-3 flex flex-col gap-1 text-[13.5px]">
            <p>{levelRangeLabel(s.levelMin, s.levelMax)}</p>
            <p className="text-muted">{ageLabel(s.ageMin, s.ageMax)}</p>
            <p className="text-muted">
              {s.intensity === "chill" ? "가볍게 즐겨요" : "집중해서 운동해요"}
            </p>
          </div>
          {s.note && (
            <p className="mt-3 rounded-lg bg-surface2 px-3.5 py-3 text-[13.5px] leading-relaxed">
              &ldquo;{s.note}&rdquo;
            </p>
          )}
        </section>

        {/* 참가 현황 — 익명 */}
        <section className="mt-6 border-t border-line pt-5">
          <h2 className="text-[15px] font-bold">
            참가 현황{" "}
            <span className="font-normal text-muted">
              {s.maleJoined + s.femaleJoined}/{s.capacity * 2}
            </span>
          </h2>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {badges.map((b) => (
              <span
                key={b.key}
                className="rounded-lg bg-surface2 px-3 py-1.5 text-[12.5px] font-medium text-ink"
              >
                {b.g === "m" ? "남" : "여"} 확정
              </span>
            ))}
            {Array.from({ length: Math.max(0, left.male) }, (_, i) => (
              <span
                key={`em${i}`}
                className="rounded-lg border border-dashed border-line px-3 py-1.5 text-[12.5px] text-faint"
              >
                남 모집중
              </span>
            ))}
            {Array.from({ length: Math.max(0, left.female) }, (_, i) => (
              <span
                key={`ef${i}`}
                className="rounded-lg border border-dashed border-line px-3 py-1.5 text-[12.5px] text-faint"
              >
                여 모집중
              </span>
            ))}
          </div>
          <p className="mt-2.5 text-[12px] leading-relaxed text-faint">
            다른 참가자 프로필은 모임이 확정되면 서로 볼 수 있어요.
          </p>
        </section>

        {/* 조기 확정 — 자리가 남아도 성비가 맞으면 그 인원으로 갈 수 있다 */}
        {s.iAmHost && canEarlyConfirm && !proposed && (
          <section className="mt-6 rounded-xl bg-accent-soft p-5">
            <p className="text-[14.5px] font-bold">
              {matched}:{matched}로 확정할까요?
            </p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
              지금 남녀 수가 맞아요. 참가자가 받으면 이 인원으로 확정되고
              채팅방이 열려요.
            </p>
            <button
              onClick={propose}
              disabled={busy}
              className="mt-3 w-full rounded-xl bg-accent py-3 text-[14px] font-semibold text-white active:bg-accent-pressed disabled:opacity-50"
            >
              {busy ? "보내는 중…" : `${matched}:${matched}로 확정 제안하기`}
            </button>
          </section>
        )}

        {s.iAmHost && proposed && (
          <section className="mt-6 rounded-xl border border-line bg-surface p-5">
            <p className="text-[14.5px] font-bold">참가자의 답을 기다리는 중…</p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
              {matched}:{matched}로 확정하자고 보냈어요. 받으면 바로 모임이
              완성돼요.
            </p>
            <button
              onClick={withdraw}
              disabled={busy}
              className="mt-3 w-full rounded-xl border border-line py-3 text-[13.5px] font-medium text-muted disabled:opacity-50"
            >
              제안 거두기
            </button>
          </section>
        )}

        {iAmGuest && proposed && !s.myAck && (
          <section className="mt-6 rounded-xl bg-accent-soft p-5">
            <p className="text-[14.5px] font-bold">
              호스트가 {matched}:{matched}로 하자고 해요
            </p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
              자리를 더 기다리지 않고 지금 인원으로 진행하자는 제안이에요.
              받으면 바로 확정되고 채팅방이 열려요.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={withdraw}
                disabled={busy}
                className="flex-1 rounded-xl border border-line bg-surface py-3 text-[13.5px] font-medium text-muted disabled:opacity-50"
              >
                더 기다릴래요
              </button>
              <button
                onClick={accept}
                disabled={busy}
                className="flex-1 rounded-xl bg-accent py-3 text-[13.5px] font-semibold text-white active:bg-accent-pressed disabled:opacity-50"
              >
                {busy ? "처리 중…" : "좋아요, 확정할게요"}
              </button>
            </div>
          </section>
        )}

        {iAmGuest && proposed && s.myAck && (
          <p className="mt-6 rounded-xl border border-line bg-surface px-5 py-4 text-center text-[12.5px] leading-relaxed text-muted">
            확정에 동의했어요. 남은 참가자의 답을 기다리는 중이에요.
          </p>
        )}

        {/* 호스트 — 눌러서 프로필 전체 보기 */}
        {s.host && (
          <section className="mt-6 border-t border-line pt-5">
            <h2 className="text-[15px] font-bold">호스트</h2>
            <Link
              href={`/session/host?id=${s.id}`}
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
                    s.host.level && `L${s.host.level} ${level(s.host.level).name}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <ChevronRightIcon size={16} className="shrink-0 text-faint" />
            </Link>
          </section>
        )}

        {/* 영상 인증 */}
        <section className="mt-6 border-t border-line pt-5">
          <h2 className="text-[15px] font-bold">등반 인증</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            모임에서 등반한 영상을 올리면 크레딧이 쌓여요. 완등하지 못해도
            괜찮아요. 영상은 나만 볼 수 있어요.
          </p>
        </section>

        {/* 안내 */}
        <section className="mt-6 border-t border-line pt-5">
          <h2 className="text-[15px] font-bold">안내</h2>
          <ul className="mt-2 flex flex-col gap-1.5 text-[13px] leading-relaxed text-muted">
            <li>일일권·신발 대여 3만원 내외, 현장에서 각자 결제해요.</li>
            <li>운동복·양말·물을 챙겨주세요. 신발은 대여할 수 있어요.</li>
            <li>손톱은 짧게, 반지는 빼고 와주세요.</li>
          </ul>
        </section>

        {s.myStatus === "confirmed" && (
          <div className="mt-6 flex flex-col gap-2">
            {/* 모임이 성사돼야 방이 열린다 — 자리가 남아도 조기 확정이면 열린다 */}
            {s.status === "confirmed" && (
              <Link
                href="/chat#session"
                className="block rounded-xl border border-line bg-surface py-3.5 text-center text-[14px] font-semibold text-ink"
              >
                모임 채팅 열기
              </Link>
            )}
            <Link
              href={`/room?id=${s.id}`}
              className="block rounded-xl border border-line bg-surface py-3.5 text-center text-[14px] font-semibold text-accent-pressed"
            >
              모임 진행 화면 열기
            </Link>
          </div>
        )}

        {s.iAmHost && (
          <button
            onClick={onDelete}
            disabled={busy}
            className="mt-6 w-full py-2 text-center text-[13px] font-medium text-danger disabled:opacity-50"
          >
            모임 삭제하기
          </button>
        )}

        {joined && !s.iAmHost && (
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
            // 내가 연 모임에는 신청할 수 없다
            disabled={busy || joined || s.iAmHost || full}
            className={`w-full rounded-xl py-3.5 text-[15px] font-semibold ${
              s.iAmHost || full
                ? "bg-surface2 text-faint"
                : joined
                  ? "bg-accent-soft text-accent-pressed"
                  : "bg-accent text-white active:bg-accent-pressed disabled:opacity-70"
            }`}
            onClick={onJoin}
          >
            {/* "확정" 이 두 가지를 뜻한다 — 내 자리가 잡혔다 · 모임이 성사됐다.
                성비가 안 맞으면 자리는 잡혀도 모임은 아직 안 열린다. */}
            {s.iAmHost
              ? "내가 연 모임이에요"
              : joined
                ? s.myStatus !== "confirmed"
                  ? "승인 대기 중 · 호스트가 확인하면 알려드려요"
                  : s.status === "confirmed"
                    ? "모임이 확정됐어요"
                    : "자리 잡았어요 · 성비가 맞으면 확정돼요"
                : busy
                  ? "신청 중…"
                  : full
                    ? "자리가 다 찼어요"
                    : `참여 신청하기 · ${SESSION_JOIN_COST}크레딧`}
          </button>
        </div>
      </div>
    </>
  );
}
