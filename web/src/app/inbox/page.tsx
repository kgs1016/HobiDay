"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { careerLabel, level } from "@/lib/levels";
import { notifyPush } from "@/lib/nativePush";
import {
  hasSupabase,
  acceptConfirm,
  approveSignup,
  currentUser,
  fetchConfirmProposals,
  fetchHostedRequests,
  fetchMySignups,
  fetchReceivedRequests,
  fetchSentRequests,
  rejectSignup,
  respondRequest,
  signedPhotoUrls,
  withdrawConfirm,
  type ConfirmProposal,
  type HostedRequest,
  type MySignup,
  type ReceivedRequest,
  type SentRequest,
} from "@/lib/supabase";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

const when = (iso: string) => {
  const d = new Date(iso);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${DAYS[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()} ${hm}`;
};

/* 호스트 승인제라 상태가 셋이다.
   waiting  호스트가 아직 안 봤거나 고민 중
   confirmed 자리가 잡혔다 (모임 성사와는 다르다)
   cut      호스트가 받지 않았거나, 답 없이 모임이 시작됐다.
            둘 다 신청비를 돌려준다 (거절은 즉시, 무응답은 크론이) */
const STATUS: Record<string, { label: string; cls: string; note?: string }> = {
  waiting: {
    label: "승인 대기",
    cls: "bg-surface2 text-muted",
    note: "호스트가 확인하면 알려드릴게요.",
  },
  confirmed: {
    label: "자리 확정",
    cls: "bg-mint/15 text-mint",
    note: "남녀 수가 맞으면 모임이 열려요.",
  },
  cut: {
    label: "거절됨",
    cls: "bg-surface2 text-muted",
    note: "신청비는 돌려드렸어요. 다른 모임을 둘러보세요.",
  },
};

type Tab = "received" | "sent";

/* 클래스 이름을 문자열로 조립하면 Tailwind 가 못 찾아서 크기가 안 먹는다.
   쓰는 크기가 하나뿐이라 그대로 적는다. */
function Avatar({ url }: { url?: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      className="h-14 w-14 shrink-0 rounded-full object-cover"
    />
  ) : (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-surface2 text-xl">
      🧗
    </div>
  );
}

function Empty({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
  return (
    <div className="mt-16 flex flex-col items-center gap-2 text-center">
      <span className="text-4xl">{icon}</span>
      <p className="text-[15px] font-bold">{title}</p>
      {sub && (
        <p className="whitespace-pre-line text-[13px] leading-relaxed text-muted">
          {sub}
        </p>
      )}
    </div>
  );
}

export default function Inbox() {
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("received");

  const [proposals, setProposals] = useState<ConfirmProposal[]>([]);
  const [hosted, setHosted] = useState<HostedRequest[]>([]);
  const [received, setReceived] = useState<ReceivedRequest[]>([]);
  const [signups, setSignups] = useState<MySignup[]>([]);
  const [sent, setSent] = useState<SentRequest[]>([]);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [pr, ho, re, si, se] = await Promise.all([
      fetchConfirmProposals(),
      fetchHostedRequests(),
      fetchReceivedRequests(),
      fetchMySignups(),
      fetchSentRequests(),
    ]);
    setProposals(pr ?? []);
    setHosted(ho ?? []);
    setReceived(re ?? []);
    setSignups(si ?? []);
    setSent(se ?? []);

    const paths = [
      ...(ho ?? []).map((x) => x.photo),
      ...(re ?? []).map((x) => x.photo),
      ...(pr ?? []).map((x) => x.host_photo),
      ...(si ?? []).map((x) => x.host_photo),
    ].filter(Boolean) as string[];
    if (paths.length) setPhotos(await signedPhotoUrls(paths));
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      if (!hasSupabase()) {
        setAuthed(false);
        setLoading(false);
        return;
      }
      const user = await currentUser();
      setAuthed(!!user);
      if (user) load();
      else setLoading(false);
    })();
  }, [load]);

  /* 관심 수락·거절 */
  const respond = async (id: string, accept: boolean) => {
    const from = received.find((x) => x.id === id)?.from_id;
    setBusy(id);
    const r = await respondRequest(id, accept);
    setBusy(null);
    if (r.error) return alert(`실패: ${r.error}`);
    setReceived((l) => l.filter((x) => x.id !== id));
    if (r.accepted) {
      if (from)
        notifyPush(from, "🎉 관심이 수락됐어요", "채팅이 열렸어요. 먼저 인사해보세요!", "/chat");
      alert("수락했어요! 채팅으로 이동합니다.");
      router.push("/chat");
    }
  };

  /* 내 모임 신청 받기·거절 */
  const decide = async (h: HostedRequest, ok: boolean) => {
    const key = `${h.session_id}:${h.user_id}`;
    setBusy(key);
    const r = ok
      ? await approveSignup(h.session_id, h.user_id)
      : await rejectSignup(h.session_id, h.user_id);
    setBusy(null);
    // 승인이든 거절이든 알린다. 신청비 10크레딧이 걸려 있어서, 결과를
    // 모르면 신청자는 신청함을 직접 열어볼 때까지 계속 기다린다.
    // (관심 거절은 여전히 안 알린다 — 짝사랑을 드러내지 않기로 했다)
    if (!r.error)
      notifyPush(
        h.user_id,
        ok ? "✅ 모임 신청이 수락됐어요" : "모임 신청 결과를 알려드려요",
        ok
          ? `${h.gym} 모임에 자리가 잡혔어요`
          : `${h.gym} 모임은 이번엔 함께하지 못하게 됐어요. 신청비는 돌려드렸어요.`,
        ok ? `/session?id=${h.session_id}` : "/inbox"
      );
    /* 참가자끼리 차단한 사이라 서버가 자동으로 잘라냈다. 호스트는
       제3자라 누가 누구를 차단했는지 알 이유가 없다 — 그냥 처리할 수
       없는 신청으로 보인다. 신청자에게는 여느 거절과 똑같이 보인다. */
    if (r.error === "blocked_member") {
      notifyPush(
        h.user_id,
        "모임 신청 결과를 알려드려요",
        `${h.gym} 모임은 이번엔 함께하지 못하게 됐어요. 신청비는 돌려드렸어요.`,
        "/inbox"
      );
      load();
      return alert("받을 수 없는 신청이라 취소했어요.\n신청비는 돌려드렸어요.");
    }
    if (r.error) {
      const msg: Record<string, string> = {
        full: "그 성별 자리가 이미 다 찼어요",
        not_waiting: "이미 처리된 신청이에요",
        not_host: "내가 연 모임이 아니에요",
        started: "이미 시작한 모임이에요",
      };
      return alert(msg[r.error] ?? `실패: ${r.error}`);
    }
    // 방 열림(확정 2명)과 정원 참은 이제 다른 사건이다.
    // 방금 승인된 사람은 위에서 "수락됐어요" 를 받았고, 먼저 확정돼
    // 있던 사람들은 서버가 준 목록으로 알린다.
    // (r 은 승인/거절 반환의 합집합이라 좁혀서 꺼낸다)
    if (ok) {
      const rr = r as { chat_opened?: boolean; confirmed?: boolean; notify?: string[] };
      if (rr.confirmed && rr.notify?.length)
        notifyPush(
          rr.notify,
          "🎉 모임이 확정됐어요",
          `${h.gym} 모임 정원이 다 찼어요`,
          "/chat#session"
        );
      if (rr.chat_opened) alert("모임 채팅방이 열렸습니다 🎉");
      else if (rr.confirmed) alert("정원이 다 찼어요! 모임이 확정됐습니다 🎉");
    }
    load();
  };

  /* 조기 확정 제안 받기·미루기 */
  const decideProposal = async (p: ConfirmProposal, ok: boolean) => {
    setBusy(p.session_id);
    if (!ok) {
      await withdrawConfirm(p.session_id);
      setBusy(null);
      return load();
    }
    const r = await acceptConfirm(p.session_id);
    setBusy(null);
    if (r.error) {
      const msg: Record<string, string> = {
        not_balanced: "그 사이 남녀 수가 어긋났어요",
        no_proposal: "호스트가 제안을 거뒀어요",
        not_open: "이미 확정된 모임이에요",
      };
      return alert(msg[r.error] ?? `실패: ${r.error}`);
    }
    if (r.confirmed) {
      alert(
        `모임이 확정됐어요! 🎉\n${r.capacity}:${r.capacity}로 진행하고, 모임 채팅방이 열렸어요.`
      );
    }
    load();
  };

  if (authed === false)
    return (
      <main className="px-4">
        <header className="pt-6 pb-4">
          <h1 className="text-[19px] font-extrabold tracking-tight">신청함</h1>
        </header>
        <div className="mt-14 flex flex-col items-center gap-3 text-center">
          <p className="text-[14px] text-muted">로그인하면 신청 내역이 보여요</p>
          <Link
            href="/login"
            className="rounded-xl bg-accent px-6 py-2.5 text-[14px] font-bold text-white"
          >
            로그인 하기
          </Link>
        </div>
      </main>
    );

  const receivedCount = proposals.length + hosted.length + received.length;
  const waitingCount = signups.filter((s) => s.my_status === "waiting").length;

  return (
    <main className="px-4">
      <header className="pt-6 pb-3">
        <h1 className="text-[19px] font-extrabold tracking-tight">신청함</h1>
      </header>

      {/* 내가 답해야 하는 것과 내가 기다리는 것은 성격이 달라서 나눈다 */}
      <div className="flex border-b border-line">
        {(
          [
            ["received", "받은 신청", receivedCount],
            ["sent", "보낸 신청", waitingCount],
          ] as const
        ).map(([key, label, badge]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex flex-1 items-center justify-center gap-1.5 pb-2.5 pt-1 text-[15px] font-bold ${
              tab === key ? "border-b-2 border-accent text-ink" : "text-muted"
            }`}
          >
            {label}
            {badge > 0 && (
              <span className="min-w-[17px] rounded-full bg-accent px-1 text-[10.5px] font-extrabold leading-[17px] text-white">
                {badge > 9 ? "9+" : badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="pt-14 text-center text-muted">불러오는 중…</p>
      ) : tab === "received" ? (
        receivedCount === 0 ? (
          <Empty
            icon="📥"
            title="답할 게 없어요"
            sub={
              "내 모임에 신청이 오거나\n받은 관심이 있으면 여기에 쌓여요"
            }
          />
        ) : (
          <div className="flex flex-col gap-6 py-4 pb-6">
            {/* 호스트의 조기 확정 제안 — 답 한 번에 모임이 열린다 */}
            {proposals.length > 0 && (
              <section>
                <h2 className="mb-2 text-[14px] font-bold">
                  🤝 모임 확정 제안{" "}
                  <span className="font-medium text-mint">{proposals.length}</span>
                </h2>
                <div className="flex flex-col gap-2">
                  {proposals.map((p) => (
                    <div
                      key={p.session_id}
                      className="rounded-2xl border border-mint/40 bg-mint/10 p-4"
                    >
                      <div className="flex items-center gap-3.5">
                        <Avatar url={p.host_photo ? photos[p.host_photo] : undefined} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-extrabold">{p.gym}</p>
                          <p className="mt-0.5 text-[12.5px] text-muted">
                            {when(p.starts_at)} · 호스트 {p.host_nickname ?? "—"}
                          </p>
                        </div>
                      </div>
                      <p className="mt-2.5 text-[12.5px] leading-relaxed text-muted">
                        {p.capacity}:{p.capacity}로 열린 모임인데, 자리를 더
                        기다리지 않고{" "}
                        <b className="text-ink">
                          {p.matched}:{p.matched}로 진행
                        </b>
                        하자는 제안이에요. 받으면 바로 확정되고 모임 채팅방이
                        열려요.
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          disabled={busy === p.session_id}
                          onClick={() => decideProposal(p, false)}
                          className="rounded-xl border border-line py-2.5 text-[13px] font-bold text-muted disabled:opacity-50"
                        >
                          더 기다릴래요
                        </button>
                        <button
                          disabled={busy === p.session_id}
                          onClick={() => decideProposal(p, true)}
                          className="rounded-xl bg-mint py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
                        >
                          {busy === p.session_id ? "처리 중…" : "좋아요, 확정할게요"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 내가 연 모임에 온 신청 */}
            {hosted.length > 0 && (
              <section>
                <h2 className="mb-2 text-[14px] font-bold">
                  🧗 내 모임 신청{" "}
                  <span className="font-medium text-accent">{hosted.length}</span>
                </h2>
                <div className="flex flex-col gap-2">
                  {hosted.map((h) => {
                    const key = `${h.session_id}:${h.user_id}`;
                    const noRoom = h.same_gender_confirmed >= h.capacity;
                    return (
                      <div
                        key={key}
                        className="rounded-2xl border border-line bg-surface p-4"
                      >
                        <p className="text-[12px] font-semibold text-muted">
                          {h.gym} · {when(h.starts_at)}
                        </p>
                        <div className="mt-2.5 flex items-center gap-3.5">
                          <Avatar url={h.photo ? photos[h.photo] : undefined} />
                          <div className="min-w-0 flex-1">
                            <p className="text-[15px] font-extrabold">
                              {h.nickname}
                              <span className="ml-1.5 text-[12px] font-medium text-muted">
                                {[h.age, h.height && `${h.height}cm`, h.area]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            </p>
                            <p className="mt-0.5 truncate text-[12.5px] text-muted">
                              {[
                                `L${h.level} ${level(h.level).name}`,
                                careerLabel(h.career) &&
                                  `구력 ${careerLabel(h.career)}`,
                                h.home_gym,
                                h.mbti,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                        </div>

                        {h.intro && (
                          <p className="mt-2.5 rounded-r-lg border-l-[3px] border-line bg-surface2 px-3 py-2 text-[13px] leading-relaxed">
                            &ldquo;{h.intro}&rdquo;
                          </p>
                        )}

                        {noRoom && (
                          <p className="mt-2.5 text-[12px] text-muted">
                            {h.gender === "m" ? "남성" : "여성"} 자리가 이미 다
                            찼어요. 받으려면 확정된 참가자가 빠져야 해요.
                          </p>
                        )}

                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <button
                            disabled={busy === key}
                            onClick={() => decide(h, false)}
                            className="rounded-xl border border-line py-2.5 text-[13px] font-bold text-muted disabled:opacity-50"
                          >
                            거절
                          </button>
                          <button
                            disabled={busy === key || noRoom}
                            onClick={() => decide(h, true)}
                            className="rounded-xl bg-accent py-2.5 text-[13px] font-bold text-white disabled:opacity-40"
                          >
                            {busy === key ? "처리 중…" : "받기"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11.5px] text-muted">
                  거절하면 상대에게 알리지 않아요.
                </p>
              </section>
            )}

            {/* 받은 관심 */}
            {received.length > 0 && (
              <section>
                <h2 className="mb-2 text-[14px] font-bold">
                  💌 받은 관심{" "}
                  <span className="font-medium text-accent">{received.length}</span>
                </h2>
                <div className="flex flex-col gap-2">
                  {received.map((r) => (
                    <div
                      key={r.id}
                      className="rounded-2xl border border-accent/40 bg-accent/[0.06] p-4"
                    >
                      <div className="flex items-center gap-3.5">
                        <Avatar url={r.photo ? photos[r.photo] : undefined} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[15px] font-extrabold">
                            {r.nickname}
                            <span className="ml-1.5 text-[12px] font-medium text-muted">
                              {[r.age, r.height && `${r.height}cm`, r.area]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </p>
                          <p className="mt-0.5 truncate text-[12.5px] text-muted">
                            {[
                              `L${r.level} ${level(r.level).name}`,
                              careerLabel(r.career) && `구력 ${careerLabel(r.career)}`,
                              r.home_gym,
                              r.mbti,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                      </div>

                      {r.message && (
                        <p className="mt-2.5 rounded-r-lg border-l-[3px] border-accent bg-surface2 px-3 py-2 text-[13px] leading-relaxed">
                          &ldquo;{r.message}&rdquo;
                        </p>
                      )}

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          disabled={busy === r.id}
                          onClick={() => respond(r.id, false)}
                          className="rounded-xl border border-line py-2.5 text-[13px] font-bold text-muted disabled:opacity-50"
                        >
                          거절
                        </button>
                        <button
                          disabled={busy === r.id}
                          onClick={() => respond(r.id, true)}
                          className="rounded-xl bg-accent py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
                        >
                          {busy === r.id ? "처리 중…" : "수락하고 채팅"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[11.5px] text-muted">
                  거절하면 상대에게 알리지 않아요.
                </p>
              </section>
            )}
          </div>
        )
      ) : signups.length === 0 && sent.length === 0 ? (
        <Empty
          icon="📤"
          title="아직 보낸 게 없어요"
          sub={"모임에 신청하거나 관심을 보내면\n여기서 진행 상황이 보여요"}
        />
      ) : (
        <div className="flex flex-col gap-6 py-4 pb-6">
          {/* 신청한 모임 */}
          {signups.length > 0 && (
            <section>
              <h2 className="mb-2 text-[14px] font-bold">🧗 신청한 모임</h2>
              <div className="flex flex-col gap-2">
                {signups.map((s) => {
                  /* 내 신청 상태만 보면 모임이 어느 단계인지가 빠진다.
                     그래서 이미 끝난 모임을 "남녀 수가 맞으면 모임이
                     열려요" 라고 안내하고 있었다. 모임 쪽을 먼저 본다 —
                     모임 상세 화면과 같은 순서다. */
                  const cancelled = s.session_status === "cancelled";
                  const gone = new Date(s.ends_at).getTime() <= Date.now();
                  const running =
                    !gone && new Date(s.starts_at).getTime() <= Date.now();
                  const mine = s.my_status === "confirmed";
                  const st = cancelled
                    ? {
                        label: "모임 취소됨",
                        cls: "bg-surface2 text-muted",
                        note: mine
                          ? "모임이 취소됐어요. 신청 크레딧은 돌려드렸어요."
                          : "모임이 취소됐어요. 대기 중이던 신청 크레딧은 돌려드렸어요.",
                      }
                    : gone
                      ? !mine
                        ? STATUS.cut
                        : s.session_status === "confirmed"
                          ? {
                              label: "다녀왔어요",
                              cls: "bg-mint/15 text-mint",
                              note: "매칭 기록에서 다시 볼 수 있어요.",
                            }
                          : {
                              /* 정원을 못 채운 채 끝난 모임. 매칭 기록은
                                 성사된 모임만 담으므로 여기서 "다시 볼 수
                                 있어요" 라고 하면 거짓말이 된다. */
                              label: "열리지 못했어요",
                              cls: "bg-surface2 text-muted",
                              note: "정원이 다 차지 않아 모임이 열리지 못했어요.",
                            }
                      : running
                        ? mine
                          ? {
                              label: "오늘 모임이에요",
                              cls: "bg-mint/15 text-mint",
                              note: "모임이 진행 중이에요.",
                            }
                          : STATUS.cut
                        : mine && s.session_status === "confirmed"
                          ? {
                              label: "모임 확정",
                              cls: "bg-mint/15 text-mint",
                              note: "정원이 다 찼어요. 채팅에서 만나요.",
                            }
                          : (STATUS[s.my_status] ?? STATUS.waiting);
                  const body = (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[14.5px] font-extrabold">
                            {s.gym}
                          </p>
                          <p className="mt-0.5 text-[12.5px] text-muted">
                            {when(s.starts_at)} · 호스트 {s.host_nickname ?? "—"}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-bold ${st.cls}`}
                        >
                          {st.label}
                        </span>
                      </div>
                      {st.note && (
                        <p className="mt-2 text-[12.5px] text-muted">{st.note}</p>
                      )}
                    </>
                  );
                  return cancelled ? (
                    <div
                      key={s.id}
                      className="rounded-2xl border border-line bg-surface p-4 opacity-70"
                    >
                      {body}
                    </div>
                  ) : (
                    <Link
                      key={s.id}
                      href={`/session?id=${s.id}`}
                      className="block rounded-2xl border border-line bg-surface p-4"
                    >
                      {body}
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* 보낸 관심 */}
          {sent.length > 0 && (
            <section>
              <h2 className="mb-2 text-[14px] font-bold">💌 보낸 관심</h2>
              {/* 목록에서 사라진 이유를 여기서 설명한다 — 거절인지
                  7일 만료인지는 일부러 구분하지 않는다 */}
              <p className="mb-2 text-[11.5px] leading-relaxed text-muted">
                상대가 거절하거나 보낸 지 7일이 지나면 목록에서 사라져요.
              </p>
              <div className="flex flex-col gap-2">
                {sent.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-2 rounded-2xl border border-line bg-surface p-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[14.5px] font-extrabold">
                        {r.nickname}
                        <span className="ml-1.5 text-[12px] font-medium text-muted">
                          {r.age} · L{r.level} {level(r.level).name}
                        </span>
                      </p>
                      <p className="mt-0.5 truncate text-[12.5px] text-muted">
                        {r.home_gym}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-bold ${
                        r.status === "accepted"
                          ? "bg-mint/15 text-mint"
                          : "bg-surface2 text-muted"
                      }`}
                    >
                      {r.status === "accepted" ? "수락됨" : "기다리는 중"}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
