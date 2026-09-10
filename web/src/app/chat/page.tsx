"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import PersonAvatar from "@/components/PersonAvatar";
import { useRouter } from "next/navigation";
import { useLocationHash, useQueryParam } from "@/lib/queryId";
import { useNow } from "@/lib/browserState";
import { sameRows } from "@/lib/polling";
import { usePolling } from "@/lib/usePolling";
import { level } from "@/lib/levels";
import ReportSheet from "@/components/ReportSheet";
import { AvatarFallback, ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import GymPhoto from "@/components/GymPhoto";
import { CarabinerIllust } from "@/components/illustrations";
import { notifyPush } from "@/lib/nativePush";
import {
  currentUser,
  fetchSessionMembers,
  fetchChatMessages,
  fetchChats,
  fetchSessionChatMessages,
  fetchSessionChats,
  hasSupabase,
  leaveChat,
  markChatRead,
  markSessionChatRead,
  sendChat,
  sendSessionChat,
  signedPhotoUrls,
  type Chat,
  type ChatMessage,
  type SessionMember,
  type SessionChat,
  type SessionChatMessage,
} from "@/lib/supabase";
import { headcountLabel } from "@/lib/capacity";

const when = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return sameDay ? hm : `${d.getMonth() + 1}/${d.getDate()}`;
};

/** 방이 어떻게 열렸는지 — 모임에서 만났거나, 채팅 신청 수락으로 연결됐거나 */
const origin = (c: Chat) =>
  c.gym ? `${c.gym}에서 만났어요` : "채팅 신청을 수락해서 연결됐어요";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

/* 방은 모임이 끝나거나 취소되고 24시간 뒤에 사라진다.
   종료 문구도 공통 시계를 따라 갱신한다. */
function endedNotice(c: SessionChat, now: number): string | null {
  if (c.status === "cancelled")
    return "모임이 취소되었어요. 24시간 뒤에 채팅방이 사라져요.";
  return new Date(c.ends_at).getTime() < now
    ? "모임이 종료되었어요. 24시간 뒤에 채팅방이 사라져요."
    : null;
}

/** 모임방 부제 — "토 8/31 · 15:00 · 4명" (지금 참여 인원) */
const sessionSub = (c: SessionChat) => {
  const d = new Date(c.starts_at);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${DAYS[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()} · ${hm} · ${headcountLabel(c.members)}`;
};

type Tab = "request" | "session";

export default function ChatPage() {
  const room = useQueryParam("room");
  /* 1:1 방 — 상대 프로필에서 돌아올 때. 방은 상태로만 열려 있어 주소가 없으면 목록에 떨어진다 */
  const thread = useQueryParam("thread");
  const hash = useLocationHash();
  if (room === undefined || thread === undefined || hash === undefined)
    return <main className="px-4 pt-24 text-center text-[13.5px] text-faint">불러오는 중…</main>;
  return (
    <ChatContent
      initialRoomId={room}
      initialThreadId={thread}
      initialTab={room || hash === "#session" ? "session" : "request"}
    />
  );
}

function ChatContent({
  initialRoomId,
  initialThreadId,
  initialTab,
}: {
  initialRoomId: string | null;
  initialThreadId: string | null;
  initialTab: Tab;
}) {
  const now = useNow();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [chats, setChats] = useState<Chat[] | null>(null);
  const [rooms, setRooms] = useState<SessionChat[] | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [openId, setOpenId] = useState(initialThreadId);
  const open = chats?.find(chat => chat.match_id === openId);
  const [openRoomId, setOpenRoomId] = useState(initialRoomId);
  // 방 목록을 받은 순간 주소의 방을 바로 표시한다. 별도의 상태 복사 효과는 없다.
  const openRoom = rooms?.find(room => room.session_id === openRoomId);

  const load = useCallback(async (signal?: AbortSignal) => {
    const [list, group] = await Promise.all([fetchChats(), fetchSessionChats()]);
    if (signal?.aborted) return;
    // 통신 실패에는 기존 목록을 유지하고, 정상 응답에서 없어진 방은 화면에서도 닫는다.
    if (list !== null) setChats(list);
    if (group !== null) setRooms(group);
    if (list?.length) {
      const urls = await signedPhotoUrls(list.map(c => c.photo).filter(Boolean) as string[]);
      if (!signal?.aborted) setPhotoUrls(urls);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      if (!hasSupabase()) return setAuthed(false);
      const user = await currentUser();
      if (controller.signal.aborted) return;
      setAuthed(!!user);
    })();
    return () => controller.abort();
  }, []);

  const refreshLists = useCallback(async (signal: AbortSignal) => {
    if (authed) await load(signal);
  }, [authed, load]);
  usePolling(refreshLists, 15_000);

  // 모임 상세에서 돌아온 방은 초기 상태로 보관하고 주소에서는 한 번 지운다.
  useEffect(() => {
    if (initialRoomId) {
      window.history.replaceState(window.history.state, "", "/chat#session");
    } else if (initialThreadId) {
      window.history.replaceState(window.history.state, "", "/chat");
    }
  }, [initialRoomId, initialThreadId]);

  /** 목록 배지는 즉시 지우고, 실제 읽음 처리는 방에서 메시지를 받은 뒤 한 번 한다. */
  const openThread = (c: Chat) => {
    setOpenId(c.match_id);
    setChats((list) =>
      (list ?? []).map((x) => (x.match_id === c.match_id ? { ...x, unread: 0 } : x))
    );
  };

  const openSession = (c: SessionChat) => {
    setOpenRoomId(c.session_id);
    setRooms((list) =>
      (list ?? []).map((x) =>
        x.session_id === c.session_id ? { ...x, unread: 0 } : x
      )
    );
  };

  const unreadOf = (list: { unread: number }[] | null) =>
    (list ?? []).reduce((n, x) => n + (x.unread > 0 ? 1 : 0), 0);

  if (authed === false)
    return (
      <main className="px-4">
        <header className="pt-6 pb-4">
          <h1 className="text-[20px] font-bold tracking-tight">채팅</h1>
        </header>
        <div className="mt-14 flex flex-col items-center gap-3 text-center">
          <p className="text-[14px] text-muted">로그인하면 대화가 보여요</p>
          <Link
            href="/login"
            className="button-primary rounded-xl px-6 py-2.5 text-[14px] font-semibold"
          >
            로그인 하기
          </Link>
        </div>
      </main>
    );

  if (open)
    return (
      <Thread
        key={open.match_id}
        chat={open}
        onBack={() => {
          setOpenId(null);
          load(); // 나올 때 목록·마지막 메시지 갱신
        }}
      />
    );

  if (openRoom)
    return (
      <SessionThread
        key={openRoom.session_id}
        room={openRoom}
        onBack={() => {
          setOpenRoomId(null);
          load();
        }}
      />
    );

  const loading = chats === null || rooms === null;

  return (
    <main className="px-4">
      <header className="pt-6 pb-3">
        <h1 className="text-[20px] font-bold tracking-tight">채팅</h1>
      </header>

      {/* 관심으로 열린 1:1 과 모임 단체방은 성격이 달라서 탭으로 나눈다 */}
      <div className="flex gap-5 border-b border-line">
        {(
          [
            ["request", "1:1 채팅", unreadOf(chats)],
            ["session", "모임 채팅", unreadOf(rooms)],
          ] as const
        ).map(([key, label, badge]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
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
      ) : tab === "session" ? (
        rooms.length === 0 ? (
          <div className="mt-16 flex flex-col items-center gap-1.5 text-center">
            <CarabinerIllust size={64} />
            <p className="mt-3 text-[15px] font-semibold">
              아직 열린 모임 채팅이 없어요
            </p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-line pb-6">
            {rooms.map((c) => (
              <button
                key={c.session_id}
                onClick={() => openSession(c)}
                className="flex items-center gap-3.5 py-3.5 text-left transition-colors active:bg-surface2"
              >
                <GymPhoto src={c.gym_thumb} name={c.gym} size={48} shape="circle" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold">
                    {c.gym}
                    <span className="ml-1.5 text-[12px] font-normal text-muted">
                      {c.members}명
                    </span>
                  </p>
                  <p
                    className={`mt-0.5 truncate text-[13px] ${
                      c.unread > 0 ? "font-medium text-ink" : "text-muted"
                    }`}
                  >
                    {c.last_body ?? sessionSub(c)}
                  </p>
                  {/* 곧 사라질 방이라는 걸 목록에서도 알린다 */}
                  {endedNotice(c, now) && (
                    <p className="mt-0.5 truncate text-[11.5px] text-faint">
                      {endedNotice(c, now)}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[11.5px] text-faint">{when(c.last_at)}</span>
                  {c.unread > 0 && (
                    <span className="min-w-[17px] rounded-full bg-danger px-1.5 text-center text-[10.5px] font-bold leading-[17px] text-white">
                      {c.unread > 99 ? "99+" : c.unread}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )
      ) : chats.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-4 text-center">
          <p className="text-[15px] font-semibold">아직 연결된 상대가 없어요</p>
          <Link
            href="/#people"
            className="button-primary rounded-xl px-6 py-3 text-[14px] font-semibold"
          >
            대화신청 하러가기
          </Link>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-line pb-6">
          {chats.map((c) => (
            <button
              key={c.match_id}
              onClick={() => openThread(c)}
              className="flex items-center gap-3.5 py-3.5 text-left transition-colors active:bg-surface2"
            >
              {c.photo && photoUrls[c.photo] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoUrls[c.photo]}
                  alt={c.nickname}
                  className="h-12 w-12 shrink-0 rounded-full object-cover"
                />
              ) : (
                <AvatarFallback size={48} />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold">
                  {c.nickname}
                  <span className="ml-1.5 text-[12px] font-normal text-muted">
                    {c.age}
                    {c.level && ` · ${level(c.level).name}`}
                  </span>
                </p>
                <p
                  className={`mt-0.5 truncate text-[13px] ${
                    c.unread > 0 ? "font-medium text-ink" : "text-muted"
                  }`}
                >
                  {c.last_body ?? origin(c)}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-[11.5px] text-faint">{when(c.last_at)}</span>
                {c.unread > 0 && (
                  <span className="min-w-[17px] rounded-full bg-danger px-1.5 text-center text-[10.5px] font-bold leading-[17px] text-white">
                    {c.unread > 99 ? "99+" : c.unread}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </main>
  );
}

/* 키보드가 올라오면 iOS 는 fixed 요소를 줄이지 않고 화면을 스크롤한다.
   그러면 입력창만 보이고 헤더·대화가 화면 밖으로 밀려난다.
   visualViewport 로 "실제 보이는 영역"을 받아 그 높이에 맞춘다. */
function useKeyboardViewport() {
  const [vv, setVv] = useState<{ h: number; top: number } | null>(null);

  useEffect(() => {
    const v = window.visualViewport;
    if (!v) return; // 미지원 브라우저는 h-dvh 폴백
    const update = () => setVv({ h: v.height, top: v.offsetTop });
    update();
    v.addEventListener("resize", update);
    v.addEventListener("scroll", update);
    return () => {
      v.removeEventListener("resize", update);
      v.removeEventListener("scroll", update);
    };
  }, []);

  // 키보드가 열렸으면 홈바 여백을 넣지 않는다 (키보드 위에 빈 틈이 생김)
  const keyboardOpen = !!vv && vv.h < window.innerHeight - 100;
  return { vv, keyboardOpen };
}

/* 전체화면 오버레이. 1:1 방과 모임 단체방이 같은 껍데기를 쓴다.
   레이아웃 래퍼가 하단 네비용 padding-bottom 을 갖고 있어서, 그 안에서
   min-h-screen + sticky 로 입력창을 붙이면 화면 밖으로 밀려난다.
   높이는 visualViewport 값으로 직접 지정한다 (inset-0 은 키보드를 모른다). */
function ChatFrame({
  onBack,
  title,
  sub,
  action,
  onTitle,
  avatar,
  titleLabel,
  closedNote,
  onSend,
  children,
}: {
  onBack: () => void;
  title: string;
  sub: string;
  /** 헤더 오른쪽 — 1:1 방은 신고 버튼이 붙는다 */
  action?: React.ReactNode;
  /** 채워져 있으면 입력창 대신 이 안내를 둔다 (상대가 나간 방) */
  closedNote?: string | null;
  /** 제목을 누를 때 — 1:1 은 상대 프로필, 모임방은 진행 화면 */
  onTitle?: () => void;
  avatar?: React.ReactNode;
  titleLabel?: string;
  onSend: (body: string) => Promise<void>;
  children: React.ReactNode;
}) {
  const { vv, keyboardOpen } = useKeyboardViewport();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    await onSend(body);
    setBusy(false);
    setText("");
  };

  return (
    <div
      className="fixed inset-x-0 top-0 z-40 mx-auto flex h-dvh max-w-md flex-col bg-bg px-4"
      style={{
        height: vv ? `${vv.h}px` : undefined,
        transform: vv ? `translateY(${vv.top}px)` : undefined,
        paddingBottom: keyboardOpen ? 0 : "env(safe-area-inset-bottom)",
      }}
    >
      <header
        className="flex shrink-0 items-center gap-2 border-b border-line pb-3"
        style={{
          paddingTop: keyboardOpen
            ? "0.75rem"
            : "calc(1.25rem + env(safe-area-inset-top))",
        }}
      >
        <button
          onClick={onBack}
          aria-label="뒤로 가기"
          className="-ml-2 flex h-10 w-10 items-center justify-center text-ink"
        >
          <ChevronLeftIcon size={22} />
        </button>
        <div className="min-w-0 flex-1">
          {onTitle ? (
            /* 누를 수 있다는 걸 알려야 해서 chevron 을 붙인다 */
            <button
              onClick={onTitle}
              aria-label={titleLabel}
              className="flex min-h-11 max-w-full items-center gap-2.5 text-left"
            >
              {avatar}
              <div className="min-w-0">
                <h1 className="truncate text-[16px] font-bold tracking-tight">
                  {title}
                </h1>
                <p className="truncate text-[11.5px] text-faint">{sub}</p>
              </div>
              <ChevronRightIcon size={14} className="shrink-0 text-faint" />
            </button>
          ) : (
            <>
              <h1 className="truncate text-[16px] font-bold tracking-tight">
                {title}
              </h1>
              <p className="truncate text-[11.5px] text-faint">{sub}</p>
            </>
          )}
        </div>
        {action}
      </header>

      {/* min-h-0 이 없으면 flex 아이템이 내용만큼 커져서 스크롤이 안 걸린다 */}
      <div className="min-h-0 flex-1 overflow-y-auto py-3">{children}</div>

      {closedNote ? (
        <p className="shrink-0 bg-bg py-4 text-center text-[12.5px] leading-relaxed text-muted">
          {closedNote}
        </p>
      ) : (
      <form onSubmit={submit} className="flex shrink-0 gap-2 bg-bg py-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="메시지 보내기"
          maxLength={1000}
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 py-3 text-[16px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
        />
        <button
          disabled={busy || !text.trim()}
          className="button-primary shrink-0 rounded-xl px-4 text-[14px] font-semibold"
        >
          전송
        </button>
      </form>
      )}
    </div>
  );
}

/** 말풍선 — 단체방에서는 남의 말에 보낸 사람이 붙는다.
 *  onProfile 이 있으면 아바타를 눌러 그 사람 프로필을 연다.
 *  1:1 방은 이름 없이(상대가 한 명뿐) 아바타만 붙는다. */
function Bubble({
  m,
  name,
  photoUrl,
  isHost,
  onProfile,
}: {
  m: ChatMessage;
  name?: string | null;
  photoUrl?: string;
  isHost?: boolean;
  onProfile?: () => void;
}) {
  const bubble = (
    <div
      className={`max-w-full rounded-[18px] px-3.5 py-2.5 text-[14px] leading-relaxed ${
        m.mine
          ? "rounded-br-md bg-accent-soft text-ink"
          : "rounded-bl-md bg-surface2 text-ink"
      }`}
    >
      {m.body}
      <span
        className="ml-2 align-bottom text-[10.5px] text-muted"
      >
        {when(m.created_at)}
      </span>
    </div>
  );

  // "○○님이 나갔어요" 같은 안내 — 누구 말도 아니라 가운데에 둔다
  if (m.kind === "system")
    return (
      <p className="my-2 self-center rounded-full bg-surface2 px-3.5 py-1.5 text-center text-[12px] text-muted">
        {m.body}
      </p>
    );

  if (m.mine) return <div className="max-w-[78%] self-end">{bubble}</div>;

  if (!name && !onProfile)
    return <div className="max-w-[78%] self-start">{bubble}</div>;

  /* 이름 줄이 있으면 아바타를 그 아래 말풍선에 맞추고(mt-4),
     없으면(1:1) 말풍선 위쪽에 맞춘다 */
  const avatar = photoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photoUrl}
      alt=""
      className={`h-7 w-7 shrink-0 rounded-full object-cover ${name ? "mt-4" : "mt-1"}`}
    />
  ) : (
    <AvatarFallback size={28} className={name ? "mt-4" : "mt-1"} />
  );

  return (
    <div className="flex max-w-[86%] gap-2 self-start">
      {onProfile ? (
        <button
          type="button"
          onClick={onProfile}
          aria-label={`${name ?? "상대"} 프로필 보기`}
          className="shrink-0 self-start"
        >
          {avatar}
        </button>
      ) : (
        avatar
      )}
      <div className="min-w-0">
        {name && (
          <p className="mb-0.5 text-[11.5px] font-medium text-muted">
            {name}
            {isHost && <span className="ml-1 text-faint">· 호스트</span>}
          </p>
        )}
        {bubble}
      </div>
    </div>
  );
}

function Thread({ chat, onBack }: { chat: Chat; onBack: () => void }) {
  const [msgs, setMsgs] = useState<ChatMessage[] | null>(null);
  const [reporting, setReporting] = useState(false);
  const router = useRouter();
  /* 상대 프로필은 어디서 열든 한 화면 — 아바타를 누르면 열린다.
     방 id 를 들려 보내 돌아올 수 있게 한다 */
  const openProfile = () =>
    router.push(`/user?id=${chat.partner_id}&m=${chat.match_id}&from=chat`);
  // 상대 말풍선 옆 아바타 — 사진 주소는 캐시돼 있어 재서명이 싸다
  const [partnerPhoto, setPartnerPhoto] = useState<string | undefined>();
  const bottom = useRef<HTMLDivElement>(null);
  const lastRead = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!chat.photo) return;
    let active = true;
    const photo = chat.photo;
    signedPhotoUrls([photo]).then(urls => {
      if (active) setPartnerPhoto(urls[photo]);
    });
    return () => { active = false; };
  }, [chat.photo]);

  const poll = useCallback(async (signal: AbortSignal) => {
    // 실패(상대가 나감 등)해도 보고 있던 대화를 지우지 않는다
    const list = await fetchChatMessages(chat.match_id, signal);
    if (!list || signal.aborted) return;
    setMsgs(previous => sameRows(previous, list) ? previous : list);
    // 작성 시각이 같은 메시지의 순서가 달라도 새 메시지를 놓치지 않는다.
    const latest = list.map(message => message.id).join(",");
    // 새 메시지가 없으면 읽음 RPC를 반복하지 않는다. 실패하면 다음 조회에서 재시도한다.
    if (lastRead.current !== latest && await markChatRead(chat.match_id, signal)) {
      if (!signal.aborted) lastRead.current = latest;
    }
  }, [chat.match_id]);
  const load = usePolling(poll);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [msgs?.length]);

  const send = async (body: string) => {
    const r = await sendChat(chat.match_id, body);
    if (r.error) {
      // closed = 내가 나간 방 · left = 상대가 나간 방 (차단당한 경우 포함)
      if (r.error === "closed" || r.error === "left")
        return alert("상대가 대화방을 나갔어요.");
      return alert(`전송 실패: ${r.error}`);
    }
    // 실패해도 조용히 — 알림이 전송을 막으면 안 된다
    // 메시지는 푸시로만 — 알림함에 한 줄씩 쌓이면 알림함이 채팅 사본이 된다
    notifyPush(chat.partner_id, "💬 새 메시지", body.slice(0, 80), "/chat", { pushOnly: true });
    load();
  };

  const leave = async () => {
    if (
      !confirm(
        "이 대화방에서 나갈까요?\n" +
          "내 목록에서만 사라져요. 상대에게는 내가 나갔다고 표시되고,\n" +
          "상대까지 나가면 대화가 완전히 지워져요."
      )
    )
      return;
    const r = await leaveChat(chat.match_id);
    if (r.error) return alert(`실패: ${r.error}`);
    onBack();
  };

  return (
    <>
      <ChatFrame
        onBack={onBack}
        title={chat.nickname}
        sub={[origin(chat), chat.level && level(chat.level).name]
          .filter(Boolean)
          .join(" · ")}
        onTitle={openProfile}
        titleLabel={`${chat.nickname} 프로필 보기`}
        avatar={<PersonAvatar url={partnerPhoto} />}
        closedNote={
          chat.partner_left
            ? "상대가 대화방을 나갔어요. 더 이상 메시지를 보낼 수 없어요."
            : null
        }
        action={
          <div className="flex shrink-0 items-center">
            <button
              onClick={leave}
              aria-label="대화방 나가기"
              className="px-2 py-1 text-[12px] font-medium text-faint"
            >
              나가기
            </button>
            <button
              onClick={() => setReporting(true)}
              aria-label="신고하기"
              className="px-2 py-1 text-[12px] font-medium text-faint"
            >
              신고
            </button>
          </div>
        }
        onSend={send}
      >
        {msgs === null ? (
          <p className="pt-10 text-center text-[13.5px] text-faint">불러오는 중…</p>
        ) : msgs.length === 0 ? (
          <p className="px-6 pt-10 text-center text-[13px] leading-relaxed text-muted">
            먼저 말을 걸어보세요.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {msgs.map((m) => (
              <Bubble
                key={m.id}
                m={m}
                photoUrl={partnerPhoto}
                onProfile={openProfile}
              />
            ))}
            <div ref={bottom} />
          </div>
        )}
      </ChatFrame>

      {reporting && (
        <ReportSheet
          targetId={chat.partner_id}
          nickname={chat.nickname}
          context="chat"
          refId={chat.match_id}
          onClose={() => setReporting(false)}
          // 차단되면 이 방은 더 열리지 않는다 — 목록으로 돌려보낸다
          onDone={onBack}
        />
      )}
    </>
  );
}

function SessionThread({
  room,
  onBack,
}: {
  room: SessionChat;
  onBack: () => void;
}) {
  const now = useNow();
  const [msgs, setMsgs] = useState<SessionChatMessage[] | null>(null);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  // 신고 — 단체방이라 누구를 신고할지 먼저 고른다
  const [picking, setPicking] = useState(false);
  const [members, setMembers] = useState<SessionMember[] | null>(null);
  const [target, setTarget] = useState<SessionMember | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const lastRead = useRef<string | undefined>(undefined);

  const poll = useCallback(async (signal: AbortSignal) => {
    // 실패(차단·모임 취소로 not_allowed 등)해도 보던 화면을 지우지 않는다
    const list = await fetchSessionChatMessages(room.session_id, signal);
    if (!list || signal.aborted) return;
    setMsgs(previous => sameRows(previous, list) ? previous : list);
    const latest = list.map(message => message.id).join(",");
    if (lastRead.current !== latest && await markSessionChatRead(room.session_id, signal)) {
      if (!signal.aborted) lastRead.current = latest;
    }
    if (!signal.aborted && list.length) {
      const paths = [
        ...new Set(list.map((m) => m.sender_photo).filter(Boolean) as string[]),
      ];
      if (paths.length) {
        const urls = await signedPhotoUrls(paths);
        if (!signal.aborted) setPhotos(previous => sameRows([previous], [urls]) ? previous : urls);
      }
    }
  }, [room.session_id]);

  const load = usePolling(poll);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [msgs?.length]);

  const send = async (body: string) => {
    const r = await sendSessionChat(room.session_id, body);
    if (r.error) return alert(`전송 실패: ${r.error}`);
    // 시간·장소를 맞추는 방이라 알림이 없으면 반쪽이다. 실패해도 조용히.
    if (r.notify?.length)
      // 메시지는 푸시로만 (알림함 제외)
      notifyPush(r.notify, `💬 ${room.gym}`, body.slice(0, 80), "/chat#session", { pushOnly: true });
    load();
  };

  const router = useRouter();

  const ended = endedNotice(room, now);

  const openPicker = async () => {
    setPicking(true);
    if (members === null) {
      /* 신고 대상은 이름만 있으면 된다. 모임 상세의 참가 현황과 같은
         명단을 쓴다 — 나만 뺀다. */
      const [me, list] = await Promise.all([
        currentUser(),
        fetchSessionMembers(room.session_id),
      ]);
      setMembers(list.filter((p) => p.id !== me?.id));
    }
  };

  return (
    <>
    <ChatFrame
      onBack={onBack}
      title={room.gym}
      sub={sessionSub(room)}
      onTitle={() => router.push(`/session?id=${room.session_id}&from=chat`)}
      titleLabel={`${room.gym} 모임 정보 보기`}
      avatar={<GymPhoto src={room.gym_thumb} name={room.gym} size={40} shape="circle" />}
      action={
        <button
          onClick={openPicker}
          aria-label="신고하기"
          className="shrink-0 px-2 py-1 text-[12px] font-medium text-faint"
        >
          신고
        </button>
      }
      onSend={send}
    >
      {msgs === null ? (
        <p className="pt-10 text-center text-[13.5px] text-faint">불러오는 중…</p>
      ) : msgs.length === 0 && !ended ? (
        <p className="px-6 pt-10 text-center text-[13px] leading-relaxed text-muted">
          만날 시간과 장소를 맞춰보세요.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {msgs.map((m) => (
            <Bubble
              key={m.id}
              m={m}
              name={m.sender_name ?? "탈퇴한 사용자"}
              photoUrl={m.sender_photo ? photos[m.sender_photo] : undefined}
              isHost={m.sender_is_host}
              /* 탈퇴한 사람(sender_id null)은 열어줄 프로필이 없다 */
              onProfile={
                m.sender_id
                  ? () =>
                      router.push(
                        `/user?id=${m.sender_id}&s=${room.session_id}&from=chat`
                      )
                  : undefined
              }
            />
          ))}
          {/* 시스템 안내 — 말풍선이 아니라 가운데 한 줄로 둔다 */}
          {ended && (
            <p className="my-2 self-center rounded-full bg-surface2 px-3.5 py-1.5 text-center text-[12px] text-muted">
              {ended}
            </p>
          )}
          <div ref={bottom} />
        </div>
      )}
    </ChatFrame>

    {/* 누구를 신고할지 고르는 시트 */}
    {picking && (
      <div
        className="fixed inset-0 z-50 flex items-end bg-black/50"
        onClick={() => setPicking(false)}
      >
        <div
          className="mx-auto max-h-[70vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-5"
          style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-[17px] font-bold">누구를 신고할까요?</p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
            신고하면 차단도 함께 돼요. 서로 안 마주치도록 아직 시작 전인
            모임에서는 빠지게 돼요.
          </p>
          {members === null ? (
            <p className="py-8 text-center text-[13px] text-faint">불러오는 중…</p>
          ) : members.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-muted">
              신고할 수 있는 참가자가 없어요
            </p>
          ) : (
            <div className="mt-4 flex flex-col gap-1.5">
              {members.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setPicking(false);
                    setTarget(p);
                  }}
                  className="button-secondary rounded-lg px-4 py-3 text-left text-[14px] font-medium"
                >
                  {p.nickname}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => setPicking(false)}
            className="button-secondary mt-4 w-full rounded-xl py-3.5 text-[14px] font-medium"
          >
            취소
          </button>
        </div>
      </div>
    )}

    {target && (
      <ReportSheet
        targetId={target.id}
        nickname={target.nickname}
        context="session"
        refId={room.session_id}
        onClose={() => setTarget(null)}
        // 신고=차단 → 서버가 이 방을 닫는다. 목록으로 돌려보낸다.
        onDone={onBack}
      />
    )}
    </>
  );
}
