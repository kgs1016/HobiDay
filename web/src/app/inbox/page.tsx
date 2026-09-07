"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { careerLabel, level } from "@/lib/levels";
import { AvatarFallback, ChevronRightIcon } from "@/components/icons";
import { ChalkBagIllust } from "@/components/illustrations";
import { notifyPush } from "@/lib/nativePush";
import {
  hasSupabase,
  approveSignup,
  currentUser,
  fetchHostedRequests,
  fetchMySignups,
  fetchReceivedRequests,
  fetchSentChanges,
  fetchSentRequests,
  markSentSeen,
  rejectSignup,
  respondRequest,
  signedPhotoUrls,
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
   cut      호스트가 받지 않았거나, 답 없이 모임이 시작됐다 */
const STATUS: Record<string, { label: string; cls: string; note?: string }> = {
  waiting: {
    label: "승인 대기",
    cls: "bg-surface2 text-muted",
    note: "호스트가 확인하면 알려드릴게요.",
  },
  /* 호스트가 받아주면 그 순간 둘이 되어 모임도 확정된다.
     자리 확정과 모임 확정이 더는 갈리지 않는다. */
  confirmed: { label: "자리 확정", cls: "bg-accent-soft text-accent-pressed" },
  /* 거절은 문을 닫지 않는다 — 시작 전이면 카드를 눌러 다시 신청한다.
     그 말을 화면에 적지는 않는다 (눌러보면 신청 버튼이 있다). */
  cut: { label: "거절됨", cls: "bg-surface2 text-muted" },
};

type Tab = "received" | "sent";

function Avatar({ url }: { url?: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      className="h-14 w-14 shrink-0 rounded-full object-cover"
    />
  ) : (
    <AvatarFallback size={56} />
  );
}

function Empty({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mt-16 flex flex-col items-center gap-1.5 text-center">
      <ChalkBagIllust size={64} />
      <p className="mt-3 text-[15px] font-semibold">{title}</p>
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

  const [hosted, setHosted] = useState<HostedRequest[]>([]);
  const [received, setReceived] = useState<ReceivedRequest[]>([]);
  const [signups, setSignups] = useState<MySignup[]>([]);
  const [sent, setSent] = useState<SentRequest[]>([]);
  /* 보낸 신청 배지 = 아직 안 본 "결과" 의 수. 대기 중인 신청은 세지
     않는다 — 호스트가 답할 일이라 내가 할 게 없는데, 예전엔 그걸 세느라
     답이 올 때까지 1이 박혀 있었다. 서버가 sent_seen_at 과 비교해 센다. */
  const [sentChanges, setSentChanges] = useState(0);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [ho, re, si, se, sc] = await Promise.all([
      fetchHostedRequests(),
      fetchReceivedRequests(),
      fetchMySignups(),
      fetchSentRequests(),
      fetchSentChanges(),
    ]);
    setHosted(ho ?? []);
    setReceived(re ?? []);
    setSignups(si ?? []);
    setSent(se ?? []);
    setSentChanges(sc);

    const paths = [
      ...(ho ?? []).map((x) => x.photo),
      ...(re ?? []).map((x) => x.photo),
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

  /* 채팅 신청 수락·거절 */
  const respond = async (id: string, accept: boolean) => {
    const from = received.find((x) => x.id === id)?.from_id;
    setBusy(id);
    const r = await respondRequest(id, accept);
    setBusy(null);
    if (r.error) return alert(`실패: ${r.error}`);
    setReceived((l) => l.filter((x) => x.id !== id));
    if (r.accepted) {
      if (from)
        notifyPush(from, "🎉 채팅 신청이 수락됐어요", "채팅이 열렸어요. 먼저 인사해보세요!", "/chat");
      alert("수락했어요! 채팅으로 이동합니다.");
      router.push("/chat");
    } else if (r.notify) {
      /* 거절도 알린다. 알림함에는 서버(request_respond)가 이미 남겼으니
         폰만 울린다 — 문구도 서버가 쓴 것과 같아야 해서 이름을 받아 쓴다. */
      notifyPush(
        r.notify,
        "채팅 신청이 거절됐어요",
        `${r.by ?? "상대"}님이 거절했어요.`,
        "/inbox",
        { pushOnly: true }
      );
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
    /* 승인은 여기서 알린다 — 그 자리에서 폰이 울리는 게 낫다.
       거절은 서버(session_reject)가 남긴다. 여기서 보내면 이미 늦다:
       거절이 signups.status 를 'cut' 으로 바꾸는 순간 can_notify 가
       "관계 없음" 이 되어 알림이 조용히 버려졌다.
       거절도 이제 알린다 — 무응답과 구분되어야 다음으로 넘어간다. */
    if (!r.error && ok)
      notifyPush(
        h.user_id,
        "✅ 모임 신청이 수락됐어요",
        `${h.gym} 모임에 자리가 잡혔어요`,
        `/session?id=${h.session_id}`
      );
    /* 참가자끼리 차단한 사이라 서버가 자동으로 잘라냈다. 호스트는
       제3자라 누가 누구를 차단했는지 알 이유가 없다 — 그냥 처리할 수
       없는 신청으로 보인다. 신청자에게는 여느 거절과 똑같이 보인다. */
    if (r.error === "blocked_member") {
      notifyPush(
        h.user_id,
        "모임 신청 결과를 알려드려요",
        `${h.gym} 모임은 이번엔 함께하지 못하게 됐어요.`,
        "/inbox"
      );
      load();
      return alert("받을 수 없는 신청이라 취소했어요.");
    }
    if (r.error) {
      const msg: Record<string, string> = {
        full: "정원이 이미 다 찼어요",
        not_waiting: "이미 처리된 신청이에요",
        not_host: "내가 연 모임이 아니에요",
        started: "이미 시작한 모임이에요",
      };
      return alert(msg[r.error] ?? `실패: ${r.error}`);
    }
    /* 둘이 되는 순간 = 모임 확정 = 방 열림. 한 사건이라 분기도 하나다.
       (예전엔 "정원이 찼다" 가 확정이라 방 열림과 따로 왔다.)
       방금 승인된 사람은 위에서 "수락됐어요" 를 받았고, 먼저 확정돼
       있던 사람들은 서버가 준 목록으로 알린다.
       (r 은 승인/거절 반환의 합집합이라 좁혀서 꺼낸다) */
    if (ok) {
      const rr = r as { chat_opened?: boolean; notify?: string[] };
      if (rr.chat_opened) {
        if (rr.notify?.length)
          notifyPush(
            rr.notify,
            "🎉 모임이 확정됐어요",
            `${h.gym} 모임 채팅방이 열렸어요`,
            "/chat#session"
          );
        alert("모임이 확정됐어요! 채팅방이 열렸습니다 🎉");
      }
    }
    load();
  };

  if (authed === false)
    return (
      <main className="px-4">
        <header className="pt-6 pb-4">
          <h1 className="text-[20px] font-bold tracking-tight">신청함</h1>
        </header>
        <div className="mt-14 flex flex-col items-center gap-3 text-center">
          <p className="text-[14px] text-muted">로그인하면 신청 내역이 보여요</p>
          <Link
            href="/login"
            className="rounded-xl bg-accent px-6 py-2.5 text-[14px] font-semibold text-white active:bg-accent-pressed"
          >
            로그인 하기
          </Link>
        </div>
      </main>
    );

  const receivedCount = hosted.length + received.length;

  /* 보낸 신청 탭을 열면 여기까지 본 것으로 친다. 배지는 기다리지 않고
     바로 0 이 된다 — 탭이 열렸는데 숫자가 남아 있으면 안 지워진 것처럼
     보인다. 서버에도 같은 시각을 남겨서 다시 들어와도 안 뜬다. */
  const openTab = (key: Tab) => {
    setTab(key);
    if (key === "sent" && sentChanges > 0) {
      setSentChanges(0);
      markSentSeen();
    }
  };

  return (
    <main className="px-4">
      <header className="pt-6 pb-3">
        <h1 className="text-[20px] font-bold tracking-tight">신청함</h1>
      </header>

      {/* 내가 답해야 하는 것과 내가 기다리는 것은 성격이 달라서 나눈다 */}
      <div className="flex gap-5 border-b border-line">
        {(
          [
            ["received", "받은 신청", receivedCount],
            ["sent", "보낸 신청", sentChanges],
          ] as const
        ).map(([key, label, badge]) => (
          <button
            key={key}
            onClick={() => openTab(key)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 pb-2.5 pt-1 text-[15px] ${
              tab === key
                ? "border-ink font-bold text-ink"
                : "border-transparent font-medium text-faint"
            }`}
          >
            {label}
            {badge > 0 && (
              <span className="min-w-[16px] rounded-full bg-danger px-1 text-center text-[10px] font-bold leading-[16px] text-white">
                {badge > 9 ? "9+" : badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="pt-16 text-center text-[13.5px] text-faint">불러오는 중…</p>
      ) : tab === "received" ? (
        receivedCount === 0 ? (
          <Empty
            title="답할 게 없어요"
            sub={
              "내 모임에 신청이 오거나\n받은 채팅 신청이 있으면 여기에 쌓여요"
            }
          />
        ) : (
          <div className="flex flex-col gap-6 py-4 pb-6">
            {/* 내가 연 모임에 온 신청 */}
            {hosted.length > 0 && (
              <section>
                <h2 className="mb-2 text-[15px] font-bold">
                  내 모임 신청{" "}
                  <span className="font-normal text-muted">{hosted.length}</span>
                </h2>
                <div className="flex flex-col gap-2">
                  {hosted.map((h) => {
                    const key = `${h.session_id}:${h.user_id}`;
                    /* 서버(session_has_seat)와 같은 셈이어야 "받기" 를
                       눌렀을 때 full 로 튕기지 않는다. */
                    const noRoom = h.confirmed_total >= h.capacity;
                    return (
                      <div
                        key={key}
                        className="rounded-xl border border-line bg-surface p-4"
                      >
                        <p className="text-[12px] text-faint">
                          {h.gym} · {when(h.starts_at)}
                        </p>
                        <div className="mt-2.5 flex items-center gap-3.5">
                          <Avatar url={h.photo ? photos[h.photo] : undefined} />
                          <div className="min-w-0 flex-1">
                            <p className="text-[15px] font-semibold">
                              {h.nickname}
                              <span className="ml-1.5 text-[12px] font-normal text-muted">
                                {[h.age, h.height && `${h.height}cm`, h.area]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            </p>
                            <p className="mt-0.5 truncate text-[12.5px] text-muted">
                              {[
                                h.level && `L${h.level} ${level(h.level).name}`,
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
                          <p className="mt-2.5 rounded-lg bg-surface2 px-3.5 py-2.5 text-[13px] leading-relaxed">
                            &ldquo;{h.intro}&rdquo;
                          </p>
                        )}

                        {noRoom && (
                          <p className="mt-2.5 text-[12px] text-muted">
                            자리가 이미 다 찼어요. 받으려면 확정된 참가자가
                            빠져야 해요.
                          </p>
                        )}

                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <button
                            disabled={busy === key}
                            onClick={() => decide(h, false)}
                            className="rounded-xl border border-line py-2.5 text-[13px] font-medium text-muted disabled:opacity-50"
                          >
                            거절
                          </button>
                          <button
                            disabled={busy === key || noRoom}
                            onClick={() => decide(h, true)}
                            className="rounded-xl bg-accent py-2.5 text-[13px] font-semibold text-white active:bg-accent-pressed disabled:opacity-40"
                          >
                            {busy === key ? "처리 중…" : "받기"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* 받은 채팅 신청 */}
            {received.length > 0 && (
              <section>
                <h2 className="mb-2 text-[15px] font-bold">
                  받은 채팅{" "}
                  <span className="font-normal text-muted">{received.length}</span>
                </h2>
                <div className="flex flex-col gap-2">
                  {received.map((r) => (
                    <div
                      key={r.id}
                      className="rounded-xl border border-line bg-surface p-4"
                    >
                      <div className="flex items-center gap-3.5">
                        <Avatar url={r.photo ? photos[r.photo] : undefined} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[15px] font-semibold">
                            {r.nickname}
                            <span className="ml-1.5 text-[12px] font-normal text-muted">
                              {[r.age, r.height && `${r.height}cm`, r.area]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </p>
                          <p className="mt-0.5 truncate text-[12.5px] text-muted">
                            {[
                              r.level && `L${r.level} ${level(r.level).name}`,
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
                        <p className="mt-2.5 rounded-lg bg-surface2 px-3.5 py-2.5 text-[13px] leading-relaxed">
                          &ldquo;{r.message}&rdquo;
                        </p>
                      )}

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          disabled={busy === r.id}
                          onClick={() => respond(r.id, false)}
                          className="rounded-xl border border-line py-2.5 text-[13px] font-medium text-muted disabled:opacity-50"
                        >
                          거절
                        </button>
                        <button
                          disabled={busy === r.id}
                          onClick={() => respond(r.id, true)}
                          className="rounded-xl bg-accent py-2.5 text-[13px] font-semibold text-white active:bg-accent-pressed disabled:opacity-50"
                        >
                          {busy === r.id ? "처리 중…" : "수락하고 채팅"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )
      ) : signups.length === 0 && sent.length === 0 ? (
        <Empty
          title="아직 보낸 게 없어요"
          sub={"모임에 신청하거나 채팅을 보내면\n여기서 진행 상황이 보여요"}
        />
      ) : (
        <div className="flex flex-col gap-7 py-4 pb-6">
          {/* 신청한 모임 */}
          {signups.length > 0 && (
            <section>
              <h2 className="mb-2 text-[15px] font-bold">신청한 모임</h2>
              <div className="flex flex-col gap-2">
                {signups.map((s) => {
                  /* 내 신청 상태만 보면 모임이 어느 단계인지가 빠진다.
                     그래서 이미 끝난 모임을 아직 열릴 것처럼 안내하고
                     있었다. 모임 쪽을 먼저 본다 — 모임 상세와 같은 순서다. */
                  const cancelled = s.session_status === "cancelled";
                  const gone = new Date(s.ends_at).getTime() <= Date.now();
                  const running =
                    !gone && new Date(s.starts_at).getTime() <= Date.now();
                  const mine = s.my_status === "confirmed";
                  const st = cancelled
                    ? {
                        label: "모임 취소됨",
                        cls: "bg-surface2 text-muted",
                        note: "모임이 취소됐어요.",
                      }
                    : gone
                      ? !mine
                        ? STATUS.cut
                        : s.session_status === "confirmed"
                          ? {
                              label: "다녀왔어요",
                              cls: "bg-accent-soft text-accent-pressed",
                              note: "매칭 기록에서 다시 볼 수 있어요.",
                            }
                          : {
                              /* 혼자인 채로 끝난 모임. 매칭 기록은 성사된
                                 모임만 담으므로 여기서 "다시 볼 수 있어요"
                                 라고 하면 거짓말이 된다. */
                              label: "열리지 못했어요",
                              cls: "bg-surface2 text-muted",
                              note: "아무도 오지 않아 모임이 열리지 못했어요.",
                            }
                      : running
                        ? mine && s.session_status === "confirmed"
                          ? {
                              label: "오늘 모임이에요",
                              cls: "bg-accent-soft text-accent-pressed",
                              note: "모임이 진행 중이에요.",
                            }
                          : mine
                            ? {
                                /* 혼자인 채로 시작 시각이 지났다.
                                   끝나면 "열리지 못했어요" 로 넘어가는데,
                                   그 전까지만 "진행 중" 이라고 말하고
                                   있었다. 같은 모임을 세 시간 사이에 두
                                   가지로 말한 셈이다. */
                                label: "열리지 못했어요",
                                cls: "bg-surface2 text-muted",
                                note: "아무도 오지 않아 모임이 열리지 못했어요.",
                              }
                            : STATUS.cut
                        : mine && s.session_status === "confirmed"
                          ? {
                              label: "모임 확정",
                              cls: "bg-accent-soft text-accent-pressed",
                              note: "채팅에서 만나요.",
                            }
                          : (STATUS[s.my_status] ?? STATUS.waiting);

                  /* 아직 시작 전인 모임은 대기든 거절이든 열어본다.
                     대기 중이면 신청을 무르러(그 버튼이 상세에만 있다),
                     거절당했으면 다시 신청하러 — 거절은 문을 닫지 않는다.
                     서버도 그 둘을 열어준다. 대기자는 관계자라서,
                     거절당한 사람은 남들과 같은 문(살아 있고 시작 안 한
                     모임)으로.

                     시작 시각이 지나면 둘 다 닫는다. 그때부터는 서버가
                     막아서 링크를 두면 "찾을 수 없어요" 로 떨어진다. */
                  const openable =
                    !cancelled &&
                    (mine
                      ? !(gone && s.session_status !== "confirmed")
                      : !running && !gone);
                  const body = (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[14.5px] font-semibold">
                            {s.gym}
                          </p>
                          <p className="mt-0.5 text-[12.5px] text-muted">
                            {when(s.starts_at)} · 호스트 {s.host_nickname ?? "—"}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <span
                            className={`rounded-md px-2.5 py-1 text-[11.5px] font-medium ${st.cls}`}
                          >
                            {st.label}
                          </span>
                          {/* 눌러서 열리는 카드라는 표시 — 여기서 현황을
                              보고 신청을 무른다 */}
                          {openable && (
                            <ChevronRightIcon size={16} className="text-faint" />
                          )}
                        </div>
                      </div>
                      {st.note && (
                        <p className="mt-2 text-[12.5px] text-faint">{st.note}</p>
                      )}
                    </>
                  );
                  return openable ? (
                    <Link
                      key={s.id}
                      href={`/session?id=${s.id}`}
                      className="block rounded-xl border border-line bg-surface p-4 transition-colors active:bg-surface2"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div
                      key={s.id}
                      className="rounded-xl border border-line bg-surface p-4 opacity-70"
                    >
                      {body}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* 보낸 채팅 신청 */}
          {sent.length > 0 && (
            <section>
              <h2 className="mb-2 text-[15px] font-bold">보낸 채팅</h2>
              <div className="flex flex-col gap-2">
                {sent.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface p-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[14.5px] font-semibold">
                        {r.nickname}
                        <span className="ml-1.5 text-[12px] font-normal text-muted">
                          {r.age}
                          {r.level && ` · L${r.level} ${level(r.level).name}`}
                        </span>
                      </p>
                      <p className="mt-0.5 truncate text-[12.5px] text-muted">
                        {r.home_gym}
                      </p>
                    </div>
                    {/* 거절과 무응답을 구분해서 보여준다. 예전엔 둘 다
                        '기다리는 중' 이었다 — 소개팅 앱이던 시절의
                        짝사랑 비노출 규칙이고, 매칭 앱에서는 다음 사람에게
                        넘어갈 수가 없어서 없앴다. */}
                    <span
                      className={`shrink-0 rounded-md px-2.5 py-1 text-[11.5px] font-medium ${
                        r.status === "accepted"
                          ? "bg-accent-soft text-accent-pressed"
                          : "bg-surface2 text-muted"
                      }`}
                    >
                      {r.status === "accepted"
                        ? "수락됨"
                        : r.status === "declined"
                          ? "거절됨"
                          : "기다리는 중"}
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
